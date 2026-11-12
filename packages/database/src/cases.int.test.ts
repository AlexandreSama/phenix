import { afterAll, describe, expect, inject, it } from 'vitest';
import {
  createCase,
  findExpiredBans,
  getCase,
  listCases,
  listGuildCases,
  revokeCases,
  summarizeMemberCases,
} from './cases.js';
import { createPrismaClient } from './client.js';
import { newGuildId } from '../test/ids.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

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

describe('listGuildCases', () => {
  const OTHER_MEMBER = '555555555555555555';
  const OTHER_MODERATOR = '666666666666666666';
  const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));

  /** Trois sanctions de types, cibles et dates différents sur un même serveur. */
  async function seed() {
    const guildId = newGuildId();
    await createCase(prisma, { ...base(guildId), type: 'WARN', reason: 'Spam dans #général' });
    await createCase(prisma, {
      ...base(guildId),
      type: 'BAN',
      targetId: OTHER_MEMBER,
      moderatorId: OTHER_MODERATOR,
      reason: '100% de pub_sauvage',
    });
    await createCase(prisma, { ...base(guildId), type: 'KICK', reason: null });
    // dates connues, pour les bornes de période
    await prisma.case.update({
      where: { guildId_number: { guildId, number: 1 } },
      data: { createdAt: day(1) },
    });
    await prisma.case.update({
      where: { guildId_number: { guildId, number: 2 } },
      data: { createdAt: day(5) },
    });
    await prisma.case.update({
      where: { guildId_number: { guildId, number: 3 } },
      data: { createdAt: day(9) },
    });
    return guildId;
  }

  const numbers = (page: { items: { number: number }[] }) => page.items.map((c) => c.number);

  it('liste les plus récentes d’abord, avec le total', async () => {
    const guildId = await seed();

    const page = await listGuildCases(prisma, guildId, {}, { page: 1, pageSize: 20 });

    expect(numbers(page)).toEqual([3, 2, 1]);
    expect(page.total).toBe(3);
  });

  it('filtre par type, modérateur et cible', async () => {
    const guildId = await seed();
    const list = (filters: Parameters<typeof listGuildCases>[2]) =>
      listGuildCases(prisma, guildId, filters, { page: 1, pageSize: 20 });

    expect(numbers(await list({ type: 'BAN' }))).toEqual([2]);
    expect(numbers(await list({ moderatorId: OTHER_MODERATOR }))).toEqual([2]);
    expect(numbers(await list({ targetId: OTHER_MEMBER }))).toEqual([2]);
    expect(numbers(await list({ type: 'BAN', targetId: '222222222222222222' }))).toEqual([]);
  });

  it('inclut les deux bornes de la période', async () => {
    const guildId = await seed();

    const page = await listGuildCases(
      prisma,
      guildId,
      { from: day(5), to: day(9) },
      { page: 1, pageSize: 20 },
    );

    expect(numbers(page)).toEqual([3, 2]);
  });

  it('filtre par statut : active, levée, terminée', async () => {
    const guildId = newGuildId();
    const now = new Date();
    await createCase(prisma, { ...base(guildId), type: 'WARN' }); // #1 levée
    await createCase(prisma, { ...base(guildId), type: 'WARN' }); // #2 active
    await createCase(prisma, {
      ...base(guildId),
      type: 'MUTE',
      expiresAt: new Date(now.getTime() - 60_000),
    }); // #3 terminée
    await createCase(prisma, {
      ...base(guildId),
      type: 'MUTE',
      expiresAt: new Date(now.getTime() + 3_600_000),
    }); // #4 active
    await createCase(prisma, { ...base(guildId), type: 'KICK' }); // #5 ni l’un ni l’autre
    await revokeCases(prisma, {
      ...base(guildId),
      type: 'WARN',
      number: 1,
      revokedById: '444444444444444444',
    });
    const list = (status: 'active' | 'revoked' | 'ended') =>
      listGuildCases(prisma, guildId, { status }, { page: 1, pageSize: 20 }, now);

    expect(numbers(await list('active'))).toEqual([4, 2]);
    expect(numbers(await list('revoked'))).toEqual([1]);
    expect(numbers(await list('ended'))).toEqual([3]);
  });

  it('cherche par numéro, par identifiant Discord ou dans la raison', async () => {
    const guildId = await seed();
    const search = (q: string) =>
      listGuildCases(prisma, guildId, { q }, { page: 1, pageSize: 20 }).then(numbers);

    expect(await search('#2')).toEqual([2]);
    expect(await search(OTHER_MODERATOR)).toEqual([2]);
    expect(await search('222222222222222222')).toEqual([3, 1]);
    expect(await search('SPAM')).toEqual([1]);
  });

  it.each(['%', '_', "'", '\\', "' OR 1=1 --", '100%'])(
    'prend %j au pied de la lettre : ni joker ni injection',
    async (q) => {
      const guildId = await seed();

      const page = await listGuildCases(prisma, guildId, { q }, { page: 1, pageSize: 20 });

      // seule la raison « 100% de pub_sauvage » contient % ou _ ; aucune ne contient les autres
      const expected = q === '%' || q === '100%' || q === '_' ? [2] : [];
      expect(numbers(page)).toEqual(expected);
    },
  );

  it('ne renvoie jamais les sanctions d’un autre serveur', async () => {
    const guildId = await seed();
    const elsewhere = newGuildId();
    await createCase(prisma, { ...base(elsewhere), type: 'WARN', reason: 'Spam' });

    const byFilter = await listGuildCases(
      prisma,
      guildId,
      { targetId: '222222222222222222' },
      { page: 1, pageSize: 20 },
    );
    const bySearch = await listGuildCases(
      prisma,
      guildId,
      { q: 'Spam' },
      { page: 1, pageSize: 20 },
    );

    expect(byFilter.total).toBe(2);
    expect(bySearch.total).toBe(1);
  });

  it('pagine, avec le total de toutes les pages', async () => {
    const guildId = await seed();

    const second = await listGuildCases(prisma, guildId, {}, { page: 2, pageSize: 2 });

    expect(numbers(second)).toEqual([1]);
    expect(second.total).toBe(3);
  });

  it('borne la taille de page demandée', async () => {
    const guildId = await seed();

    const page = await listGuildCases(prisma, guildId, {}, { page: 1, pageSize: 10_000 });

    expect(page.items).toHaveLength(3);
    expect(page.pageSize).toBe(100);
  });
});

describe('summarizeMemberCases', () => {
  it('compte par type et relève ce qui est encore actif', async () => {
    const guildId = newGuildId();
    const now = new Date();
    const muteEnd = new Date(now.getTime() + 3_600_000);
    await createCase(prisma, { ...base(guildId), type: 'WARN' });
    await createCase(prisma, { ...base(guildId), type: 'WARN' });
    await createCase(prisma, { ...base(guildId), type: 'WARN' });
    await createCase(prisma, { ...base(guildId), type: 'MUTE', expiresAt: muteEnd });
    await createCase(prisma, { ...base(guildId), type: 'BAN' });
    // un autre membre et un autre serveur ne comptent pas
    await createCase(prisma, { ...base(guildId), targetId: '555555555555555555', type: 'WARN' });
    await createCase(prisma, { ...base(newGuildId()), type: 'WARN' });
    await revokeCases(prisma, {
      ...base(guildId),
      type: 'WARN',
      number: 1,
      revokedById: '444444444444444444',
    });

    const summary = await summarizeMemberCases(prisma, guildId, '222222222222222222', now);

    expect(summary.total).toBe(5);
    expect(summary.byType).toEqual({ WARN: 3, MUTE: 1, UNMUTE: 0, KICK: 0, BAN: 1, UNBAN: 0 });
    expect(summary.activeWarns).toBe(2);
    expect(summary.activeMute).toEqual({ number: 4, expiresAt: muteEnd });
    expect(summary.activeBan).toEqual({ number: 5 });
  });

  it('ne signale ni sourdine ni bannissement actifs pour un membre sans sanction', async () => {
    const summary = await summarizeMemberCases(prisma, newGuildId(), '222222222222222222');

    expect(summary).toEqual({
      total: 0,
      byType: { WARN: 0, MUTE: 0, UNMUTE: 0, KICK: 0, BAN: 0, UNBAN: 0 },
      activeWarns: 0,
      activeMute: null,
      activeBan: null,
    });
  });
});
