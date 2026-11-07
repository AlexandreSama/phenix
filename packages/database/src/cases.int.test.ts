import { afterAll, describe, expect, inject, it } from 'vitest';
import { createCase, findExpiredBans, getCase, listCases, revokeCases } from './cases.js';
import { createPrismaClient } from './client.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

/** Un ID de serveur neuf par test : les tests partagent la même base, et peuvent être relancés. */
const runId = Date.now();
let counter = 0;
const newGuildId = () => `${runId}${counter++}`;

const base = (guildId: string) => ({
  guildId,
  guildName: 'Serveur de test',
  targetId: '222222222222222222',
  moderatorId: '333333333333333333',
});

describe('createCase', () => {
  it('numérote sans trou ni doublon, même avec 20 sanctions simultanées', async () => {
    const guildId = newGuildId();

    const cases = await Promise.all(
      Array.from({ length: 20 }, () => createCase(prisma, { ...base(guildId), type: 'WARN' })),
    );

    const numbers = cases.map((c) => c.number).toSorted((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('repart de #1 sur chaque serveur', async () => {
    const first = await createCase(prisma, { ...base(newGuildId()), type: 'WARN' });
    const second = await createCase(prisma, { ...base(newGuildId()), type: 'KICK' });

    expect(first.number).toBe(1);
    expect(second.number).toBe(1);
  });
});

describe('revokeCases', () => {
  it('retire les avertissements actifs, une seule fois', async () => {
    const guildId = newGuildId();
    await createCase(prisma, { ...base(guildId), type: 'WARN' });
    await createCase(prisma, { ...base(guildId), type: 'WARN' });
    const input = { ...base(guildId), type: 'WARN' as const, revokedById: '444444444444444444' };

    expect(await revokeCases(prisma, input)).toBe(2);
    expect(await revokeCases(prisma, input)).toBe(0);

    const warn = await getCase(prisma, guildId, 1);
    expect(warn?.revokedById).toBe('444444444444444444');
  });

  it('ignore un mute déjà terminé', async () => {
    const guildId = newGuildId();
    await createCase(prisma, {
      ...base(guildId),
      type: 'MUTE',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const revoked = await revokeCases(prisma, {
      ...base(guildId),
      type: 'MUTE',
      revokedById: '444444444444444444',
    });
    expect(revoked).toBe(0);
  });
});

describe('listCases et findExpiredBans', () => {
  it('liste les sanctions de la plus récente à la plus ancienne', async () => {
    const guildId = newGuildId();
    await createCase(prisma, { ...base(guildId), type: 'WARN' });
    await createCase(prisma, { ...base(guildId), type: 'MUTE', expiresAt: new Date() });

    const cases = await listCases(prisma, guildId, base(guildId).targetId);
    expect(cases.map((c) => c.type)).toEqual(['MUTE', 'WARN']);
  });

  it('trouve les bans échus, pas les bans en cours ni définitifs', async () => {
    const guildId = newGuildId();
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3_600_000);
    await createCase(prisma, { ...base(guildId), type: 'BAN', expiresAt: past });
    await createCase(prisma, { ...base(guildId), type: 'BAN', expiresAt: future });
    await createCase(prisma, { ...base(guildId), type: 'BAN' });

    const expired = await findExpiredBans(prisma, [guildId]);
    expect(expired.map((c) => c.number)).toEqual([1]);
  });
});
