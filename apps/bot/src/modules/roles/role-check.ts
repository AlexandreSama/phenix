import { hasForbiddenPermissions } from '@phenix/shared';
import type { Role } from 'discord.js';

/** Pourquoi le bot refuse de distribuer ce rôle par un panel, ou null s'il peut. */
export function panelRoleRefusal(role: Pick<Role, 'editable' | 'permissions'>): string | null {
  if (!role.editable) return 'Je ne peux plus donner ce rôle : il est placé au-dessus du mien.';
  if (hasForbiddenPermissions(role.permissions.bitfield)) {
    return 'Ce rôle donne des droits de modération : je ne le distribue pas par un panel.';
  }
  return null;
}

export interface RoleChangeCheck {
  actorId: string;
  targetId: string;
  ownerId: string;
  /** Position du rôle le plus haut de chacun (0 = @everyone) */
  actorTop: number;
  targetTop: number;
  role: { position: number; managed: boolean; isEveryone: boolean; botCanEdit: boolean };
}

/**
 * Les règles de /gestionrole, celles de Discord plus une : comme pour les sanctions,
 * on n'agit pas sur un membre placé au-dessus de soi. Le propriétaire passe partout.
 * Renvoie le message de refus, ou null si le changement est permis.
 */
export function checkRoleChange({
  actorId,
  targetId,
  ownerId,
  actorTop,
  targetTop,
  role,
}: RoleChangeCheck): string | null {
  if (role.isEveryone) return 'Le rôle @everyone appartient à tout le monde : il ne se donne pas.';
  if (role.managed) {
    return 'Ce rôle est géré par une intégration (bot, boost…) : Discord le gère seul.';
  }
  if (actorId !== ownerId) {
    if (role.position >= actorTop) return 'Ce rôle est égal ou supérieur à ton rôle le plus haut.';
    if (targetId !== actorId && targetTop >= actorTop) {
      return 'Ce membre a un rôle égal ou supérieur au tien.';
    }
  }
  if (!role.botCanEdit) {
    return 'Je ne peux pas gérer ce rôle : place mon rôle au-dessus de lui dans les réglages du serveur.';
  }
  return null;
}
