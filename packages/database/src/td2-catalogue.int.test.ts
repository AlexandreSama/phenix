import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { seedTd2Catalogue } from './td2-catalogue.js';

const prisma = createPrismaClient(inject('databaseUrl'));

beforeAll(async () => {
  await seedTd2Catalogue(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seedTd2Catalogue', () => {
  it('peut être relancé sans créer de doublon', async () => {
    await seedTd2Catalogue(prisma);

    expect(await prisma.td2Activity.count()).toBe(4);
    expect(await prisma.td2ActivityMode.count()).toBe(6);
  });

  it('donne 8 places au raid Dark Hours en Semi-Speed, dont 2 tanks', async () => {
    const mode = await prisma.td2ActivityMode.findFirstOrThrow({
      where: { name: 'Semi-Speed', activity: { name: 'Dark Hours' } },
      include: { slots: true },
    });

    const total = mode.slots.reduce((sum, slot) => sum + slot.count, 0);
    expect(total).toBe(8);
    expect(mode.slots.find((slot) => slot.role === 'TANK')?.count).toBe(2);
  });
});
