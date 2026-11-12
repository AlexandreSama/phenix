import type {
  Guild,
  GuildMember,
  MessageCreateOptions,
  PartialGuildMember,
  User,
} from 'discord.js';
import type { GuildConfigCache, GuildSettings } from '../../core/guild-config-cache.js';
import type { Logger } from '../../logger.js';
import {
  createGuildRateLimiter,
  createMemberPause,
  type AnnouncementKind,
  type GuildRateLimiter,
  type MemberPause,
} from './join-limiter.js';
import { errorFields } from './log-fields.js';
import { goodbyePayload, welcomePayload, type AnnouncedMember } from './messages.js';
import { createRoleQueue, type RoleQueue } from './role-queue.js';
import { giveWelcomeRole } from './welcome-role.js';

/** Anti-raid : au plus 10 annonces (arrivées et départs) par minute et par serveur. */
export const ANNOUNCEMENTS_PER_MINUTE = 10;
/** Une annonce d'arrivée et une de départ par membre toutes les 10 minutes. */
const MEMBER_PAUSE_MS = 10 * 60_000;

export interface WelcomeDeps {
  configs: Pick<GuildConfigCache, 'get'>;
  logger: Pick<Logger, 'warn' | 'error'>;
  announcements: GuildRateLimiter;
  pause: MemberPause;
  roles: RoleQueue;
}

/** Les freins du module, partagés par les trois handlers. L'horloge est injectable pour les tests. */
export function createWelcomeDeps({
  configs,
  logger,
  now = Date.now,
}: Pick<WelcomeDeps, 'configs' | 'logger'> & { now?: () => number }): WelcomeDeps {
  return {
    configs,
    logger,
    announcements: createGuildRateLimiter({ max: ANNOUNCEMENTS_PER_MINUTE, windowMs: 60_000, now }),
    pause: createMemberPause({ ttlMs: MEMBER_PAUSE_MS, now }),
    roles: createRoleQueue({ now, logger }),
  };
}

/** Ce qu'on affiche du membre (pseudo du serveur, sinon celui du compte). */
function announced(who: GuildMember | User): AnnouncedMember {
  return {
    id: who.id,
    displayName: who.displayName,
    avatarUrl: who.displayAvatarURL({ extension: 'png', size: 256 }),
  };
}

async function readSettings(deps: WelcomeDeps, guildId: string): Promise<GuildSettings | null> {
  try {
    return await deps.configs.get(guildId);
  } catch (err) {
    deps.logger.error({ guildId, ...errorFields(err) }, 'Could not read welcome settings');
    return null;
  }
}

function enqueueRole(deps: WelcomeDeps, member: GuildMember, roleId: string): void {
  deps.roles.enqueue(member.guild.id, () => giveWelcomeRole(member, roleId, deps.logger));
}

/**
 * Envoie une annonce, après la pause du membre (silencieuse) et la limite du serveur.
 * Aucun échec ne remonte : un salon disparu ou un refus de Discord est seulement journalisé.
 */
async function announce(
  deps: WelcomeDeps,
  kind: AnnouncementKind,
  guild: Guild,
  memberId: string,
  channelId: string,
  build: () => MessageCreateOptions,
): Promise<void> {
  const { logger } = deps;
  const guildId = guild.id;
  if (!deps.pause.take(kind, guildId, memberId)) return;

  const { allowed, warn } = deps.announcements.take(guildId);
  if (!allowed) {
    if (warn) {
      logger.warn(
        { guildId, limit: ANNOUNCEMENTS_PER_MINUTE },
        'Too many member announcements in this guild (possible raid): skipping messages for now',
      );
    }
    return;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isSendable()) {
    logger.warn(
      { guildId, channelId, kind },
      'Member announcement channel missing or not sendable',
    );
    return;
  }
  try {
    await channel.send(build());
  } catch (err) {
    logger.warn({ guildId, channelId, kind, ...errorFields(err) }, 'Member announcement failed');
  }
}

/**
 * Arrivée : message tout de suite s'il est activé ; rôle d'arrivée, indépendant du message,
 * dès qu'un rôle est choisi et seulement si la vérification Discord est passée.
 */
export function createMemberAddHandler(deps: WelcomeDeps) {
  return async (member: GuildMember): Promise<void> => {
    if (member.user.bot) return;
    const settings = await readSettings(deps, member.guild.id);
    if (!settings) return;

    if (settings.welcomeRoleId && !member.pending) {
      enqueueRole(deps, member, settings.welcomeRoleId);
    }
    if (settings.welcomeEnabled && settings.welcomeChannelId) {
      await announce(deps, 'welcome', member.guild, member.id, settings.welcomeChannelId, () =>
        welcomePayload(announced(member), member.guild, settings.welcomeMessage),
      );
    }
  };
}

/**
 * Fin de la vérification Discord : le rôle d'arrivée, et seulement dans ce cas. L'état
 * précédent doit être connu (pas partiel) : un pseudo changé ne redonne pas un rôle retiré.
 */
export function createMemberUpdateHandler(deps: WelcomeDeps) {
  return async (
    oldMember: GuildMember | PartialGuildMember,
    member: GuildMember,
  ): Promise<void> => {
    if (member.user.bot) return;
    const passedScreening =
      oldMember.partial === false && oldMember.pending === true && member.pending === false;
    if (!passedScreening) return;

    const settings = await readSettings(deps, member.guild.id);
    if (!settings?.welcomeRoleId) return;
    if (member.roles.cache.has(settings.welcomeRoleId)) return;
    enqueueRole(deps, member, settings.welcomeRoleId);
  };
}

/** Départ (y compris ban et expulsion) ; un membre absent du cache s'annonce par son compte. */
export function createMemberRemoveHandler(deps: WelcomeDeps) {
  return async (member: GuildMember | PartialGuildMember): Promise<void> => {
    if (member.user.bot || member.id === member.client.user.id) return;
    const settings = await readSettings(deps, member.guild.id);
    if (!settings?.goodbyeEnabled || !settings.goodbyeChannelId) return;

    const who = member.partial ? member.user : member;
    await announce(deps, 'goodbye', member.guild, member.id, settings.goodbyeChannelId, () =>
      goodbyePayload(announced(who), member.guild, settings.goodbyeMessage),
    );
  };
}
