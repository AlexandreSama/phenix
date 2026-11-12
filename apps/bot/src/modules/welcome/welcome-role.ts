import { hasForbiddenPermissions } from '@phenix/shared';
import { PermissionFlagsBits, type GuildMember, type Role } from 'discord.js';
import type { Logger } from '../../logger.js';
import { errorFields } from './log-fields.js';

export type WelcomeRoleRefusal =
  | 'role-missing'
  | 'role-above-bot'
  | 'missing-manage-roles'
  | 'role-managed'
  | 'everyone'
  | 'forbidden-permissions';

type RoleLike = Pick<Role, 'id' | 'editable' | 'managed'> & { permissions: { bitfield: bigint } };

/**
 * Pourquoi le bot ne donne pas ce rôle d'arrivée, ou null s'il peut. Mêmes garde-fous que les
 * panels de rôles : jamais un rôle qui donne des droits de modération à n'importe quel arrivant.
 */
export function welcomeRoleRefusal(
  role: RoleLike | undefined,
  { guildId, botCanManageRoles }: { guildId: string; botCanManageRoles: boolean },
): WelcomeRoleRefusal | null {
  if (!role) return 'role-missing';
  // `editable` vaut déjà false sans ManageRoles ou pour un rôle géré : ces causes d'abord
  if (!botCanManageRoles) return 'missing-manage-roles';
  if (role.managed) return 'role-managed';
  if (!role.editable) return 'role-above-bot';
  if (role.id === guildId) return 'everyone';
  if (hasForbiddenPermissions(role.permissions.bitfield)) return 'forbidden-permissions';
  return null;
}

/** Donne le rôle d'arrivée ; un refus est journalisé (sans rien sur le membre), jamais relancé. */
export async function giveWelcomeRole(
  member: GuildMember,
  roleId: string,
  logger: Pick<Logger, 'warn'>,
): Promise<void> {
  const { guild } = member;
  const role = guild.roles.cache.get(roleId);
  const refusal = welcomeRoleRefusal(role, {
    guildId: guild.id,
    botCanManageRoles: guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false,
  });
  if (refusal || !role) {
    logger.warn({ guildId: guild.id, roleId, reason: refusal }, 'Welcome role not granted');
    return;
  }

  try {
    await member.roles.add(role, "Rôle d'arrivée");
  } catch (err) {
    logger.warn(
      { guildId: guild.id, roleId, ...errorFields(err) },
      'Discord refused the welcome role',
    );
  }
}
