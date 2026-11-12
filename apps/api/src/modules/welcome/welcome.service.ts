import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@phenix/database';
import type { ManageableGuild, WelcomeSettings } from '@phenix/shared';
import { BotEventsService } from '../../core/bot-events.service.js';
import { newGuildConfig } from '../guild-config/guild-config.service.js';
import { GuildsService } from '../guilds/guilds.service.js';

const WELCOME_FIELDS = {
  welcomeEnabled: true,
  welcomeChannelId: true,
  welcomeMessage: true,
  welcomeRoleId: true,
  goodbyeEnabled: true,
  goodbyeChannelId: true,
  goodbyeMessage: true,
} as const;

/** Les sept réglages, un à un : jamais d'autre colonne de la config dans la réponse. */
const toSettings = (config: WelcomeSettings): WelcomeSettings => ({
  welcomeEnabled: config.welcomeEnabled,
  welcomeChannelId: config.welcomeChannelId,
  welcomeMessage: config.welcomeMessage,
  welcomeRoleId: config.welcomeRoleId,
  goodbyeEnabled: config.goodbyeEnabled,
  goodbyeChannelId: config.goodbyeChannelId,
  goodbyeMessage: config.goodbyeMessage,
});

@Injectable()
export class WelcomeService {
  constructor(
    private readonly db: PrismaClient,
    private readonly botEvents: BotEventsService,
    private readonly guilds: GuildsService,
  ) {}

  /** Les réglages ; la config est créée avec les valeurs par défaut si elle n'existe pas encore. */
  async get(guildId: string): Promise<WelcomeSettings> {
    const config = await this.db.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: newGuildConfig(guildId),
      select: WELCOME_FIELDS,
    });
    return toSettings(config);
  }

  /** Enregistre le formulaire entier, puis prévient le bot : il relit sa config. */
  async save(
    guildId: string,
    input: WelcomeSettings,
    access: ManageableGuild,
  ): Promise<WelcomeSettings> {
    await this.assertMayChangeRole(guildId, input, access);
    await this.assertBelongsToGuild(guildId, input);

    // Champ par champ : un corps qui contiendrait d'autres colonnes ne les atteint pas
    const data = {
      welcomeEnabled: input.welcomeEnabled,
      welcomeChannelId: input.welcomeChannelId,
      welcomeMessage: input.welcomeMessage,
      welcomeRoleId: input.welcomeRoleId,
      goodbyeEnabled: input.goodbyeEnabled,
      goodbyeChannelId: input.goodbyeChannelId,
      goodbyeMessage: input.goodbyeMessage,
    };
    const config = await this.db.guildConfig.upsert({
      where: { guildId },
      update: data,
      create: { ...newGuildConfig(guildId), ...data },
      select: WELCOME_FIELDS,
    });
    await this.botEvents.notify({ type: 'config.updated', guildId });
    return toSettings(config);
  }

  /**
   * Donner un rôle à chaque arrivant relève de l'onglet Rôles : un délégué qui n'a que
   * l'onglet Bienvenue peut renvoyer le rôle déjà enregistré, pas en choisir un autre.
   */
  private async assertMayChangeRole(
    guildId: string,
    input: WelcomeSettings,
    access: ManageableGuild,
  ): Promise<void> {
    if (access.access === 'admin' || access.modules.includes('ROLES')) return;
    const current = await this.db.guildConfig.findUnique({
      where: { guildId },
      select: { welcomeRoleId: true },
    });
    if ((current?.welcomeRoleId ?? null) !== input.welcomeRoleId) {
      throw new ForbiddenException(
        'Seul un administrateur, ou un accès à l’onglet Rôles, peut changer le rôle d’arrivée',
      );
    }
  }

  /** Le schéma vérifie la forme des IDs ; ici on vérifie qu'ils existent sur CE serveur. */
  private async assertBelongsToGuild(guildId: string, input: WelcomeSettings): Promise<void> {
    const channelIds = [input.welcomeChannelId, input.goodbyeChannelId].filter(
      (id): id is string => id !== null,
    );
    if (channelIds.length > 0) {
      const known = new Set((await this.guilds.channels(guildId)).map((channel) => channel.id));
      if (channelIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Salon inconnu sur ce serveur');
      }
    }
    if (input.welcomeRoleId !== null) {
      // Ni @everyone ni les rôles de bot ne sont dans la liste : ils sont donc refusés aussi
      const role = (await this.guilds.roles(guildId)).find(({ id }) => id === input.welcomeRoleId);
      if (!role) throw new BadRequestException('Rôle inconnu sur ce serveur');
      if (!role.assignable) {
        throw new BadRequestException(
          `Le rôle « ${role.name} » ne peut pas être distribué : ${role.blockedReason}`,
        );
      }
    }
  }
}
