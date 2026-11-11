import type { PrismaClient } from './generated/prisma/client.js';
import type { CatalogueWrite } from './td2-catalogue-admin.js';

type Db = Pick<PrismaClient, 'td2Directive'>;

/** Les directives, par ordre alphabétique. `activeOnly` : celles que le bot propose. */
export function listTd2Directives(db: Db, { activeOnly = false } = {}) {
  return db.td2Directive.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { name: 'asc' },
  });
}

export interface Td2DirectiveInput {
  name: string;
  description: string | null;
}

/** Ajoute une directive. Le nom est unique. */
export async function createTd2Directive(
  db: Db,
  input: Td2DirectiveInput,
): Promise<CatalogueWrite & { id?: number }> {
  const { count } = await db.td2Directive.createMany({ data: [input], skipDuplicates: true });
  if (count === 0) return { status: 'duplicate' };
  const directive = await db.td2Directive.findUniqueOrThrow({ where: { name: input.name } });
  return { status: 'ok', id: directive.id };
}

/**
 * Renomme, décrit ou (dés)active une directive. Les missions déjà créées gardent le nom
 * qu'elles ont copié : leur message ne change pas après coup.
 */
export async function updateTd2Directive(
  db: Db,
  id: number,
  patch: Partial<Td2DirectiveInput> & { active?: boolean },
): Promise<CatalogueWrite> {
  const directive = await db.td2Directive.findUnique({ where: { id } });
  if (!directive) return { status: 'missing' };
  if (patch.name && patch.name !== directive.name) {
    const clash = await db.td2Directive.findUnique({ where: { name: patch.name } });
    if (clash) return { status: 'duplicate' };
  }
  await db.td2Directive.update({ where: { id }, data: patch });
  return { status: 'ok' };
}

/** Supprime une directive. Rien ne s'y rattache : les missions ont copié son nom. */
export async function deleteTd2Directive(db: Db, id: number): Promise<boolean> {
  const { count } = await db.td2Directive.deleteMany({ where: { id } });
  return count > 0;
}
