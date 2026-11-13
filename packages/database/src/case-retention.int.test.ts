import { afterAll, describe, expect, inject, it } from 'vitest';
import { purgeCases } from './case-retention.js';
import { createCase } from './cases.js';
import { createPrismaClient } from './client.js';
import type { CaseType } from './generated/prisma/enums.js';
import { newGuildId } from '../test/ids.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Un « maintenant » loin dans le passé : la purge parcourt toute la base, partagée en parallèle avec
 * les autres fichiers de test, dont les sanctions datent de 2026. Seules les sanctions de ce fichier,
 * datées avant 2001, peuvent donc être purgées, et les totaux renvoyés sont exacts.
 */
const NOW = new Date('2001-06-15T12:00:00Z');
/** La limite de 12 mois (réglage par défaut) pour NOW */
const CUTOFF = new Date('2000-06-15T12:00:00Z');
const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);
const yearsAgo = (years: number) =>
  new Date(Date.UTC(NOW.getUTCFullYear() - years, NOW.getUTCMonth(), NOW.getUTCDate(), 12));
const monthsAgo = (months: number) =>
  new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - months, NOW.getUTCDate(), 12));

interface Dates {
  createdAt?: Date;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}

/** Une sanction créée par `createCase` (le compteur du serveur avance), puis datée à la main. */
async function seed(guildId: string, type: CaseType, dates: Dates = {}): Promise<number> {
  const { number } = await createCase(prisma, {
    guildId,
    guildName: 'Serveur de test',
    type,
    targetId: '222222222222222222',
    moderatorId: '333333333333333333',
  });
  await prisma.case.update({
    where: { guildId_number: { guildId, number } },
    data: { createdAt: yearsAgo(10), ...dates },
  });
  return number;
}

async function remaining(guildId: string): Promise<number[]> {
  const cases = await prisma.case.findMany({ where: { guildId }, orderBy: { number: 'asc' } });
  return cases.map((c) => c.number);
}

describe('purgeCases : frontières (12 mois par défaut, sans ligne GuildConfig)', () => {
  it('purge une sanction levée avant la limite, garde celle levée pile à la limite', async () => {
    const guildId = newGuildId();
    await seed(guildId, 'WARN', { revokedAt: ms(CUTOFF, -1) }); // #1 purgée
    await seed(guildId, 'WARN', { revokedAt: CUTOFF }); // #2 gardée
    await seed(guildId, 'BAN', { revokedAt: ms(CUTOFF, -1) }); // #3 purgée
    await seed(guildId, 'MUTE', { expiresAt: ms(NOW, 3_600_000), revokedAt: ms(CUTOFF, -1) }); // #4 purgée
    await seed(guildId, 'BAN', { revokedAt: ms(CUTOFF, 1) }); // #5 gardée

    await purgeCases(prisma, NOW);

    expect(await remaining(guildId)).toEqual([2, 5]);
  });

  it('purge une sourdine terminée avant la limite, garde celle terminée pile à la limite', async () => {
    const guildId = newGuildId();
    await seed(guildId, 'MUTE', { expiresAt: ms(CUTOFF, -1) }); // #1 purgée
    await seed(guildId, 'MUTE', { expiresAt: CUTOFF }); // #2 gardée
    await seed(guildId, 'MUTE', { expiresAt: ms(CUTOFF, 1) }); // #3 gardée

    await purgeCases(prisma, NOW);

    expect(await remaining(guildId)).toEqual([2, 3]);
  });

  it.each<CaseType>(['KICK', 'UNBAN', 'UNMUTE'])(
    'purge un %s créé avant la limite (clos dès sa création), garde celui créé pile à la limite',
    async (type) => {
      const guildId = newGuildId();
      await seed(guildId, type, { createdAt: ms(CUTOFF, -1) }); // #1 purgée
      await seed(guildId, type, { createdAt: CUTOFF }); // #2 gardée

      await purgeCases(prisma, NOW);

      expect(await remaining(guildId)).toEqual([2]);
    },
  );

  it('ne purge jamais une sanction active, si vieille soit-elle', async () => {
    const guildId = newGuildId();
    await seed(guildId, 'WARN', { createdAt: yearsAgo(5) }); // avertissement actif
    await seed(guildId, 'BAN', { createdAt: yearsAgo(5) }); // ban définitif actif
    // ban temporaire échu mais pas levé : le membre est encore banni, il reste « active »
    await seed(guildId, 'BAN', { createdAt: yearsAgo(4), expiresAt: yearsAgo(3) });
    // sourdine en cours, créée il y a 3 ans
    await seed(guildId, 'MUTE', { createdAt: yearsAgo(3), expiresAt: ms(NOW, 86_400_000) });
    // sourdine sans échéance, ancienne, jamais levée : encore en cours
    await seed(guildId, 'MUTE', { createdAt: yearsAgo(5), expiresAt: null });

    await purgeCases(prisma, NOW);

    expect(await remaining(guildId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ne modifie pas la table Guild : la sanction suivante reprend au compteur + 1', async () => {
    const guildId = newGuildId();
    await seed(guildId, 'KICK');
    await seed(guildId, 'WARN', { revokedAt: yearsAgo(5) });
    await seed(guildId, 'MUTE', { expiresAt: yearsAgo(5) });
    const before = await prisma.guild.findUniqueOrThrow({ where: { id: guildId } });

    await purgeCases(prisma, NOW);

    expect(await remaining(guildId)).toEqual([]);
    expect(await prisma.guild.findUniqueOrThrow({ where: { id: guildId } })).toEqual(before);
    const next = await createCase(prisma, {
      guildId,
      guildName: 'Serveur de test',
      type: 'WARN',
      targetId: '222222222222222222',
      moderatorId: '333333333333333333',
    });
    expect(next.number).toBe(before.caseCounter + 1);
  });
});

describe('purgeCases : réglage par serveur', () => {
  it('applique la durée de chaque serveur, sans effet sur les autres, et compte ce qui est purgé', async () => {
    const [a, b, c, d] = [newGuildId(), newGuildId(), newGuildId(), newGuildId()];
    for (const guildId of [a, b, c, d]) {
      await seed(guildId, 'KICK', { createdAt: monthsAgo(7) }); // #1
      await seed(guildId, 'KICK', { createdAt: monthsAgo(13) }); // #2
      await seed(guildId, 'KICK', { createdAt: monthsAgo(25) }); // #3
    }
    await prisma.guildConfig.create({ data: { guildId: a, caseRetentionMonths: 6 } });
    await prisma.guildConfig.create({ data: { guildId: b, caseRetentionMonths: 24 } });
    await prisma.guildConfig.create({ data: { guildId: c, caseRetentionMonths: null } });
    // d : aucune ligne GuildConfig, donc 12 mois

    const result = await purgeCases(prisma, NOW);

    expect(await remaining(a)).toEqual([]);
    expect(await remaining(b)).toEqual([1, 2]);
    expect(await remaining(c)).toEqual([1, 2, 3]);
    expect(await remaining(d)).toEqual([1]);
    // seuls ces serveurs ont des sanctions purgeables (les tests précédents ont déjà purgé les leurs)
    expect(result).toEqual({ guilds: 3, cases: 6, skipped: 0 });
  });

  it('un second passage consécutif ne purge plus rien', async () => {
    expect(await purgeCases(prisma, NOW)).toEqual({ guilds: 0, cases: 0, skipped: 0 });
  });
});

describe('purgeCases : durée invalide en base', () => {
  it('saute le serveur à durée invalide sans rien lui purger, et purge les autres', async () => {
    const [a, b] = [newGuildId(), newGuildId()];
    await seed(a, 'KICK', { createdAt: yearsAgo(5) });
    await seed(b, 'KICK', { createdAt: yearsAgo(5) });
    // insertion directe : l'API refuse 0, mais une valeur invalide peut arriver en base
    await prisma.guildConfig.create({ data: { guildId: a, caseRetentionMonths: 0 } });
    await prisma.guildConfig.create({ data: { guildId: b, caseRetentionMonths: 12 } });

    const result = await purgeCases(prisma, NOW);

    expect(await remaining(a)).toEqual([1]);
    expect(await remaining(b)).toEqual([]);
    expect(result).toEqual({ guilds: 1, cases: 1, skipped: 1 });
    // aucun identifiant de serveur dans le résultat
    expect(JSON.stringify(result)).not.toContain(a);
  });
});

describe('purgeCases : date de référence invalide', () => {
  it('lève au lieu de sauter chaque serveur en silence', async () => {
    await expect(purgeCases(prisma, new Date('invalide'))).rejects.toThrow(RangeError);
  });
});
