import type { RolePanelInput } from '@phenix/shared';
import type { PrismaClient, RolePanel, RolePanelOption } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'rolePanel'>;

export type RolePanelWithOptions = RolePanel & { options: RolePanelOption[] };

/** Les boutons dans l'ordre choisi sur le site. */
const WITH_OPTIONS = { options: { orderBy: { position: 'asc' } } } as const;

export function findRolePanel(db: Db, id: number): Promise<RolePanelWithOptions | null> {
  return db.rolePanel.findUnique({ where: { id }, include: WITH_OPTIONS });
}

export function listRolePanels(db: Db, guildId: string): Promise<RolePanelWithOptions[]> {
  return db.rolePanel.findMany({
    where: { guildId },
    include: WITH_OPTIONS,
    orderBy: { createdAt: 'asc' },
  });
}

/** Panels enregistrés pendant que le bot était éteint : le pub/sub ne garde pas les messages. */
export function findPendingRolePanels(db: Db, guildIds: string[]): Promise<{ id: number }[]> {
  return db.rolePanel.findMany({
    where: { guildId: { in: guildIds }, publishedAt: null, publishError: null },
    select: { id: true },
  });
}

/**
 * Crée un panel, ou remplace tout son contenu. Les boutons sont réécrits en entier,
 * dans l'ordre reçu, et le panel repasse « en attente » jusqu'à ce que le bot le publie.
 */
export function saveRolePanel(
  db: Db,
  guildId: string,
  input: RolePanelInput,
  id?: number,
): Promise<RolePanelWithOptions> {
  const fields = {
    title: input.title,
    description: input.description,
    channelId: input.channelId,
    mode: input.mode,
    publishedAt: null,
    publishError: null,
  };
  const options = input.options.map((option, position) => ({ ...option, position }));

  if (id === undefined) {
    return db.rolePanel.create({
      data: { ...fields, guildId, options: { create: options } },
      include: WITH_OPTIONS,
    });
  }
  // Une seule écriture imbriquée : Prisma la passe dans une transaction
  return db.rolePanel.update({
    where: { id },
    data: { ...fields, options: { deleteMany: {}, create: options } },
    include: WITH_OPTIONS,
  });
}

/** Le bot a posté ou modifié le message. updateMany : pas d'erreur si le panel a été supprimé entre-temps. */
export async function markRolePanelPublished(db: Db, id: number, messageId: string): Promise<void> {
  await db.rolePanel.updateMany({
    where: { id },
    data: { messageId, publishedAt: new Date(), publishError: null },
  });
}

/** Le bot n'a pas pu publier : le message d'erreur s'affiche sur le site. */
export async function markRolePanelFailed(db: Db, id: number, error: string): Promise<void> {
  await db.rolePanel.updateMany({
    where: { id },
    data: { publishedAt: null, publishError: error },
  });
}
