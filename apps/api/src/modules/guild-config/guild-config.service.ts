import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@phenix/database';
import type { GeneralConfig, GeneralConfigPatch, ManageableGuild } from '@phenix/shared';
import { BotEventsService } from '../../core/bot-events.service.js';
import { GuildsService } from '../guilds/guilds.service.js';

/** Une config neuve : les listes de Postgres n'ont pas de valeur par défaut dans Prisma. */
export function newGuildConfig(guildId: string) {
  return { guildId, staffRoleIds: [], ticketStaffRoleIds: [], td2ReportViewerRoleIds: [] };
}

const GENERAL_FIELDS = {
  timezone: true,
  modLogChannelId: true,
  announceChannelId: true,
  staffRoleIds: true,
  caseRetentionMonths: true,
} as const;

/**
 * La base garde la durée en `Int` ; l'API n'y écrit que les choix du schéma partagé
 * (6, 12, 24 ou null), d'où le rétrécissement du type.
 */
function asGeneralConfig(
  row: Omit<GeneralConfig, 'caseRetentionMonths'> & {
    caseRetentionMonths: number | null;
  },
): GeneralConfig {
  return row as GeneralConfig;
}

@Injectable()
export class GuildConfigService {
  constructor(
    private readonly db: PrismaClient,
    private readonly botEvents: BotEventsService,
    private readonly guilds: GuildsService,
  ) {}

  /** La config générale ; créée avec les valeurs par défaut si elle n'existe pas encore. */
  async get(guildId: string): Promise<GeneralConfig> {
    const config = await this.db.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: newGuildConfig(guildId),
      select: GENERAL_FIELDS,
    });
    return asGeneralConfig(config);
  }

  async update(
    guildId: string,
    patch: GeneralConfigPatch,
    access: ManageableGuild['access'],
  ): Promise<GeneralConfig> {
    await this.assertBelongsToGuild(guildId, patch);
    const current = await this.get(guildId); // la ligne existe avant la mise à jour
    // Avant toute écriture : un refus n'enregistre rien du reste du corps
    this.assertMayChangeRetention(access, patch, current);
    // Un délégué n'écrit jamais la durée, même inchangée : sinon il écraserait celle qu'un
    // administrateur aurait changée entre la lecture ci-dessus et l'écriture
    const { caseRetentionMonths: _retention, ...delegatePatch } = patch;
    const data = access === 'admin' ? patch : delegatePatch;

    const config = await this.db.guildConfig.update({
      where: { guildId },
      data,
      select: GENERAL_FIELDS,
    });
    await this.botEvents.notify({ type: 'config.updated', guildId });
    return asGeneralConfig(config);
  }

  /**
   * La durée de conservation supprime des données : réservée aux administrateurs. Le site renvoie
   * toute la config à chaque enregistrement ; un délégué n'est refusé que si la valeur change.
   */
  private assertMayChangeRetention(
    access: ManageableGuild['access'],
    patch: GeneralConfigPatch,
    current: GeneralConfig,
  ): void {
    if (access === 'admin' || patch.caseRetentionMonths === undefined) return;
    if (patch.caseRetentionMonths === current.caseRetentionMonths) return;
    throw new ForbiddenException(
      'Seul un administrateur du serveur peut changer la durée de conservation des sanctions.',
    );
  }

  /** Le schéma vérifie la forme des IDs ; ici on vérifie qu'ils existent sur CE serveur. */
  private async assertBelongsToGuild(guildId: string, patch: GeneralConfigPatch): Promise<void> {
    const channelIds = [patch.modLogChannelId, patch.announceChannelId].filter(
      (id): id is string => typeof id === 'string',
    );
    if (channelIds.length > 0) {
      const known = new Set((await this.guilds.channels(guildId)).map((channel) => channel.id));
      if (channelIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Salon inconnu sur ce serveur');
      }
    }
    if (patch.staffRoleIds && patch.staffRoleIds.length > 0) {
      const known = new Set((await this.guilds.roles(guildId)).map((role) => role.id));
      if (patch.staffRoleIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Rôle inconnu sur ce serveur');
      }
    }
  }
}
