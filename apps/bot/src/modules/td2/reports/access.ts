import { PermissionFlagsBits } from 'discord.js';
import type { GuildSettings } from '../../../core/guild-config-cache.js';

/** Ce que les règles lisent d'un membre ; un GuildMember convient, un faux de test aussi. */
export interface ReportMember {
  permissions: { has(flag: bigint): boolean };
  roles: { cache: { has(roleId: string): boolean } };
}

type ReviewSettings = Pick<GuildSettings, 'staffRoleIds'> | null;
type ViewSettings = Pick<GuildSettings, 'staffRoleIds' | 'td2ReportViewerRoleIds'> | null;

/** Examinent les signalements : « Gérer le serveur », ou un rôle d'équipe (onglet Général du site). */
export function canReviewReports(member: ReportMember, settings: ReviewSettings): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (settings?.staffRoleIds ?? []).some((roleId) => member.roles.cache.has(roleId))
  );
}

/** Consultent les signalements d'un joueur : ceux qui examinent, plus les rôles choisis sur le site. */
export function canViewReports(member: ReportMember, settings: ViewSettings): boolean {
  return (
    canReviewReports(member, settings) ||
    (settings?.td2ReportViewerRoleIds ?? []).some((roleId) => member.roles.cache.has(roleId))
  );
}
