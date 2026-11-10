import type { PrismaClient, Td2ActivityKind, Td2Role } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'td2Activity' | 'td2ActivityMode' | 'td2Event' | '$transaction'>;

const ROLES: Td2Role[] = ['DPS', 'HEAL', 'TANK', 'HEAL_TANK'];

/** Une composition complète : un nombre de places par rôle, zéro compris. */
export type Td2Composition = Record<Td2Role, number>;

/** Le catalogue entier, activités désactivées comprises, avec l'usage de chaque mode. */
export async function listTd2Catalogue(db: Pick<PrismaClient, 'td2Activity'>) {
  const activities = await db.td2Activity.findMany({
    include: {
      modes: {
        orderBy: { name: 'asc' },
        include: { slots: true, _count: { select: { events: true } } },
      },
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  });
  return activities.map((activity) => ({
    id: activity.id,
    kind: activity.kind,
    name: activity.name,
    active: activity.active,
    modes: activity.modes.map((mode) => ({
      id: mode.id,
      name: mode.name,
      slots: Object.fromEntries(
        ROLES.map((role) => [role, mode.slots.find((slot) => slot.role === role)?.count ?? 0]),
      ) as Td2Composition,
      eventCount: mode._count.events,
    })),
  }));
}

/** Les rôles à zéro ne sont pas enregistrés : pas de bouton « Tank 0/0 » sous une sortie. */
const slotRows = (slots: Td2Composition) =>
  ROLES.filter((role) => slots[role] > 0).map((role) => ({ role, count: slots[role] }));

export type CatalogueWrite = { status: 'missing' } | { status: 'duplicate' } | { status: 'ok' };

/** Ajoute une activité. Le nom est unique par type : deux raids « Dark Hours », non. */
export async function createTd2Activity(
  db: Pick<PrismaClient, 'td2Activity'>,
  input: { kind: Td2ActivityKind; name: string },
): Promise<CatalogueWrite & { id?: number }> {
  // ON CONFLICT DO NOTHING : un doublon donne 0 ligne au lieu d'une erreur
  const { count } = await db.td2Activity.createMany({ data: [input], skipDuplicates: true });
  if (count === 0) return { status: 'duplicate' };
  const activity = await db.td2Activity.findUniqueOrThrow({
    where: { kind_name: { kind: input.kind, name: input.name } },
  });
  return { status: 'ok', id: activity.id };
}

/** Renomme ou (dés)active une activité. Désactivée, elle disparaît de l'autocomplétion de /td2. */
export function updateTd2Activity(
  db: Db,
  id: number,
  patch: { name?: string; active?: boolean },
): Promise<CatalogueWrite> {
  return db.$transaction(async (tx) => {
    const activity = await tx.td2Activity.findUnique({ where: { id } });
    if (!activity) return { status: 'missing' } as const;
    if (patch.name && patch.name !== activity.name) {
      const clash = await tx.td2Activity.findUnique({
        where: { kind_name: { kind: activity.kind, name: patch.name } },
      });
      if (clash) return { status: 'duplicate' } as const;
    }
    await tx.td2Activity.update({ where: { id }, data: patch });
    return { status: 'ok' } as const;
  });
}

/** Ajoute un mode à une activité. */
export function createTd2Mode(
  db: Db,
  activityId: number,
  input: { name: string; slots: Td2Composition },
): Promise<CatalogueWrite & { id?: number }> {
  return db.$transaction(async (tx) => {
    const activity = await tx.td2Activity.findUnique({ where: { id: activityId } });
    if (!activity) return { status: 'missing' } as const;
    const clash = await tx.td2ActivityMode.findUnique({
      where: { activityId_name: { activityId, name: input.name } },
    });
    if (clash) return { status: 'duplicate' } as const;
    const mode = await tx.td2ActivityMode.create({
      data: { activityId, name: input.name, slots: { create: slotRows(input.slots) } },
    });
    return { status: 'ok', id: mode.id } as const;
  });
}

/**
 * Renomme un mode et change sa composition. Les sorties déjà créées gardent la leur :
 * elle a été copiée à leur création (phase 7.1).
 */
export function updateTd2Mode(
  db: Db,
  modeId: number,
  input: { name: string; slots: Td2Composition },
): Promise<CatalogueWrite> {
  return db.$transaction(async (tx) => {
    const mode = await tx.td2ActivityMode.findUnique({ where: { id: modeId } });
    if (!mode) return { status: 'missing' } as const;
    if (input.name !== mode.name) {
      const clash = await tx.td2ActivityMode.findUnique({
        where: { activityId_name: { activityId: mode.activityId, name: input.name } },
      });
      if (clash) return { status: 'duplicate' } as const;
    }
    await tx.td2ActivityMode.update({
      where: { id: modeId },
      data: {
        name: input.name,
        slots: { deleteMany: {}, create: slotRows(input.slots) },
      },
    });
    return { status: 'ok' } as const;
  });
}

/** Supprime un mode qu'aucune sortie n'utilise. Un mode utilisé se garde : son activité se désactive. */
export function deleteTd2Mode(
  db: Db,
  modeId: number,
): Promise<{ status: 'missing' } | { status: 'in-use'; events: number } | { status: 'ok' }> {
  return db.$transaction(async (tx) => {
    const mode = await tx.td2ActivityMode.findUnique({ where: { id: modeId } });
    if (!mode) return { status: 'missing' } as const;
    const events = await tx.td2Event.count({ where: { modeId } });
    if (events > 0) return { status: 'in-use', events } as const;
    await tx.td2ActivityMode.delete({ where: { id: modeId } });
    return { status: 'ok' } as const;
  });
}
