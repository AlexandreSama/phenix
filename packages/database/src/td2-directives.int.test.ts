import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import { seedTd2Catalogue, TD2_DIRECTIVES } from './td2-catalogue.js';
import {
  createTd2Directive,
  deleteTd2Directive,
  listTd2Directives,
  updateTd2Directive,
} from './td2-directives.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

// Des noms propres à ce lancement : les directives sont partagées par tous les tests
const run = newGuildId().slice(-8);
const named = (name: string) => `${name} ${run}`;

describe('directives', () => {
  it('le seed pose les cinq directives du jeu, sans doublon s’il est relancé', async () => {
    await seedTd2Catalogue(prisma);
    await seedTd2Catalogue(prisma);

    const names = TD2_DIRECTIVES.map((directive) => directive.name);
    expect(await prisma.td2Directive.count({ where: { name: { in: names } } })).toBe(5);
  });

  it('ajoute, puis refuse un nom déjà pris', async () => {
    const created = await createTd2Directive(prisma, {
      name: named('Chrono'),
      description: 'Trente minutes pour finir.',
    });

    expect(created).toEqual({ status: 'ok', id: expect.any(Number) });
    expect(await createTd2Directive(prisma, { name: named('Chrono'), description: null })).toEqual({
      status: 'duplicate',
    });
  });

  it('renomme et désactive ; une directive désactivée n’est plus proposée', async () => {
    const { id } = await createTd2Directive(prisma, { name: named('Silence'), description: null });
    await createTd2Directive(prisma, { name: named('Bruit'), description: null });

    expect(await updateTd2Directive(prisma, id!, { name: named('Bruit') })).toEqual({
      status: 'duplicate',
    });
    expect(
      await updateTd2Directive(prisma, id!, {
        name: named('Silence radio'),
        description: 'Pas de chat vocal.',
        active: false,
      }),
    ).toEqual({ status: 'ok' });
    expect(await updateTd2Directive(prisma, 999_999, { active: true })).toEqual({
      status: 'missing',
    });

    const all = await listTd2Directives(prisma);
    const offered = await listTd2Directives(prisma, { activeOnly: true });
    expect(all.find((directive) => directive.id === id)).toMatchObject({
      name: named('Silence radio'),
      description: 'Pas de chat vocal.',
      active: false,
    });
    expect(offered.map((directive) => directive.id)).not.toContain(id);
    expect(offered.map((directive) => directive.name)).toContain(named('Bruit'));
    // Par ordre alphabétique
    const names = all.map((directive) => directive.name);
    expect(names).toEqual(names.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('supprime une directive, une seule fois', async () => {
    const { id } = await createTd2Directive(prisma, { name: named('Éphémère'), description: null });

    expect(await deleteTd2Directive(prisma, id!)).toBe(true);
    expect(await deleteTd2Directive(prisma, id!)).toBe(false);
  });
});
