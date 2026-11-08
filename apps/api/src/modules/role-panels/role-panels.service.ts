import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  findRolePanel,
  listRolePanels,
  PrismaClient,
  publicationStatus,
  saveRolePanel,
  type RolePanelWithOptions,
} from '@phenix/database';
import {
  ROLE_PANEL_LIMITS,
  type RolePanelDetail,
  type RolePanelInput,
  type RolePanelSummary,
} from '@phenix/shared';
import { BotEventsService } from '../../core/bot-events.service.js';
import { GuildsService } from '../guilds/guilds.service.js';

function toDetail(panel: RolePanelWithOptions): RolePanelDetail {
  return {
    id: panel.id,
    title: panel.title,
    description: panel.description,
    channelId: panel.channelId,
    mode: panel.mode,
    options: panel.options.map(({ roleId, label, emoji }) => ({ roleId, label, emoji })),
    status: publicationStatus(panel),
    publishError: panel.publishError,
  };
}

@Injectable()
export class RolePanelsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly botEvents: BotEventsService,
    private readonly guilds: GuildsService,
  ) {}

  async list(guildId: string): Promise<RolePanelSummary[]> {
    const panels = await listRolePanels(this.db, guildId);
    return panels.map((panel) => ({
      id: panel.id,
      title: panel.title,
      channelId: panel.channelId,
      mode: panel.mode,
      optionCount: panel.options.length,
      status: publicationStatus(panel),
      publishError: panel.publishError,
    }));
  }

  async get(guildId: string, id: number): Promise<RolePanelDetail> {
    return toDetail(await this.findOwned(guildId, id));
  }

  async create(guildId: string, input: RolePanelInput): Promise<RolePanelDetail> {
    const count = await this.db.rolePanel.count({ where: { guildId } });
    if (count >= ROLE_PANEL_LIMITS.panels) {
      throw new BadRequestException(`${ROLE_PANEL_LIMITS.panels} panels au plus par serveur`);
    }
    await this.assertValid(guildId, input);

    const panel = await saveRolePanel(this.db, guildId, input);
    await this.botEvents.notify({ type: 'rolePanel.publish', panelId: panel.id });
    return toDetail(panel);
  }

  async update(guildId: string, id: number, input: RolePanelInput): Promise<RolePanelDetail> {
    const previous = await this.findOwned(guildId, id);
    await this.assertValid(guildId, input);

    // Nouveau salon : l'ancien message part, le bot en postera un neuf
    if (previous.messageId && previous.channelId !== input.channelId) {
      await this.db.rolePanel.update({ where: { id }, data: { messageId: null } });
      await this.botEvents.notify({
        type: 'rolePanel.delete',
        guildId,
        channelId: previous.channelId,
        messageId: previous.messageId,
      });
    }

    const panel = await saveRolePanel(this.db, guildId, input, id);
    await this.botEvents.notify({ type: 'rolePanel.publish', panelId: id });
    return toDetail(panel);
  }

  async remove(guildId: string, id: number): Promise<void> {
    const panel = await this.findOwned(guildId, id);
    await this.db.rolePanel.delete({ where: { id } });
    if (panel.messageId) {
      await this.botEvents.notify({
        type: 'rolePanel.delete',
        guildId,
        channelId: panel.channelId,
        messageId: panel.messageId,
      });
    }
  }

  /** Un panel d'un autre serveur répond 404, comme un panel inexistant : on ne révèle rien. */
  private async findOwned(guildId: string, id: number): Promise<RolePanelWithOptions> {
    const panel = await findRolePanel(this.db, id);
    if (!panel || panel.guildId !== guildId) throw new NotFoundException('Panel introuvable');
    return panel;
  }

  /** Le salon et chaque rôle doivent exister sur ce serveur, et le bot doit pouvoir donner les rôles. */
  private async assertValid(guildId: string, input: RolePanelInput): Promise<void> {
    const [channels, roles] = await Promise.all([
      this.guilds.channels(guildId),
      this.guilds.roles(guildId),
    ]);
    if (!channels.some((channel) => channel.id === input.channelId)) {
      throw new BadRequestException('Salon inconnu sur ce serveur');
    }

    const byId = new Map(roles.map((role) => [role.id, role]));
    const problems = input.options.flatMap((option) => {
      const role = byId.get(option.roleId);
      if (!role) return [`Rôle inconnu sur ce serveur (bouton « ${option.label} »)`];
      return role.assignable
        ? []
        : [`Le rôle « ${role.name} » ne peut pas être distribué : ${role.blockedReason}`];
    });
    if (problems.length > 0) throw new BadRequestException(problems);
  }
}
