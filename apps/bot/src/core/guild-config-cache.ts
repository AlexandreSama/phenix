import type { GuildConfig, PrismaClient } from '@phenix/database';

/** Les réglages qu'utilise le bot. Le reste de GuildConfig arrivera avec ses modules. */
export type GuildSettings = Pick<
  GuildConfig,
  | 'timezone'
  | 'modLogChannelId'
  | 'announceChannelId'
  | 'staffRoleIds'
  | 'xpEnabled'
  | 'xpMin'
  | 'xpMax'
  | 'xpCooldownSec'
  | 'levelUpChannelId'
  | 'leaderboardPublic'
  | 'ticketCategoryId'
  | 'ticketStaffRoleIds'
  | 'ticketLogChannelId'
  | 'td2ChannelId'
  | 'td2ReportChannelId'
  | 'td2ReportViewerRoleIds'
  | 'td2ReportFeedChannelId'
>;

export interface GuildConfigCache {
  /** Les réglages d'un serveur, ou null s'il n'en a pas encore. */
  get(guildId: string): Promise<GuildSettings | null>;
  /** Oublie un serveur : la prochaine lecture repassera par la base. */
  invalidate(guildId: string): void;
  /** Oublie tout, par exemple après une coupure de Valkey où des événements ont pu se perdre. */
  clear(): void;
}

const SELECT = {
  timezone: true,
  modLogChannelId: true,
  announceChannelId: true,
  staffRoleIds: true,
  xpEnabled: true,
  xpMin: true,
  xpMax: true,
  xpCooldownSec: true,
  levelUpChannelId: true,
  leaderboardPublic: true,
  ticketCategoryId: true,
  ticketStaffRoleIds: true,
  ticketLogChannelId: true,
  td2ChannelId: true,
  td2ReportChannelId: true,
  td2ReportViewerRoleIds: true,
  td2ReportFeedChannelId: true,
} satisfies Record<keyof GuildSettings, true>;

/**
 * Garde en mémoire la config de chaque serveur pour ne pas interroger la base à chaque log.
 * Le site prévient le bot à chaque changement ; la durée de vie rattrape un message perdu.
 */
export function createGuildConfigCache(
  db: Pick<PrismaClient, 'guildConfig'>,
  ttlMs = 5 * 60_000,
  now: () => number = Date.now,
): GuildConfigCache {
  const entries = new Map<string, { value: Promise<GuildSettings | null>; expiresAt: number }>();

  return {
    get(guildId) {
      const entry = entries.get(guildId);
      if (entry && entry.expiresAt > now()) return entry.value;

      const value = db.guildConfig.findUnique({ where: { guildId }, select: SELECT });
      entries.set(guildId, { value, expiresAt: now() + ttlMs });
      // Une lecture ratée n'est pas gardée : la suivante réessaiera
      value.catch(() => entries.delete(guildId));
      return value;
    },
    invalidate(guildId) {
      entries.delete(guildId);
    },
    clear() {
      entries.clear();
    },
  };
}
