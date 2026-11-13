import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { newGuildId } from '../test/ids.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

/** Le SQL de la migration de données, lu sur disque : c'est lui, et pas une copie, qui est testé. */
function backfillSql(): string {
  const migrations = join(import.meta.dirname, '../prisma/migrations');
  const folder = readdirSync(migrations).find((name) => name.endsWith('_ticket_types_backfill'));
  if (!folder) throw new Error('Migration ticket_types_backfill introuvable');
  return readFileSync(join(migrations, folder, 'migration.sql'), 'utf8');
}

/** Exécute le script tel quel, comme `prisma migrate deploy` (protocole simple, plusieurs requêtes). */
async function runBackfill(): Promise<void> {
  const client = new pg.Client({ connectionString: inject('databaseUrl') });
  await client.connect();
  try {
    await client.query(backfillSql());
  } finally {
    await client.end();
  }
}

const CATEGORY = '100000000000000001';
const STAFF_ROLES = ['200000000000000001', '200000000000000002'];

async function newGuild(): Promise<string> {
  const id = newGuildId();
  await prisma.guild.create({ data: { id, name: 'Serveur de test' } });
  return id;
}

const ticket = (guildId: string, number: number, status: 'OPEN' | 'CLOSED') =>
  prisma.ticket.create({
    data: {
      guildId,
      number,
      channelId: `${guildId}${number}`,
      ownerId: `${number}`,
      status,
    },
  });

describe('migration de données ticket_types_backfill', () => {
  it('crée un type par serveur configuré, y rattache ses tickets et remet le panel en attente, sans rien refaire au second passage', async () => {
    const guildId = await newGuild();
    await prisma.guildConfig.create({
      data: {
        guildId,
        ticketCategoryId: CATEGORY,
        ticketStaffRoleIds: STAFF_ROLES,
        ticketLogChannelId: '300000000000000001',
      },
    });
    await prisma.ticketPanel.create({
      data: {
        guildId,
        channelId: '300000000000000002',
        messageId: `${guildId}9`,
        title: 'Besoin d’aide ?',
        description: null,
        buttonLabel: 'Contacter le staff',
        publishedAt: new Date('2026-11-01T10:00:00Z'),
      },
    });
    const open = await ticket(guildId, 1, 'OPEN');
    const closed = await ticket(guildId, 2, 'CLOSED');

    await runBackfill();

    const types = await prisma.ticketType.findMany({ where: { guildId } });
    expect(types).toHaveLength(1);
    expect(types[0]).toMatchObject({
      name: 'Contacter le staff',
      description: null,
      emoji: '🎫',
      categoryId: CATEGORY,
      staffRoleIds: STAFF_ROLES,
      position: 0,
    });
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: [open.id, closed.id] } },
      select: { typeId: true },
    });
    expect(tickets.map((row) => row.typeId)).toEqual([types[0]!.id, types[0]!.id]);
    // Le panel est republié au démarrage du bot : il repasse « en attente », message conservé
    const panel = await prisma.ticketPanel.findUniqueOrThrow({ where: { guildId } });
    expect(panel.publishedAt).toBe(null);
    expect(panel.publishError).toBe(null);
    expect(panel.messageId).toBe(`${guildId}9`);
    // Le salon de logs et les anciennes colonnes sont gardés
    const config = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId } });
    expect(config.ticketLogChannelId).toBe('300000000000000001');
    expect(config.ticketCategoryId).toBe(CATEGORY);

    // Le bot a republié le panel entre-temps : un second passage ne doit ni le remettre en attente
    // ni créer de second type
    const republishedAt = new Date('2026-11-13T08:00:00Z');
    await prisma.ticketPanel.update({ where: { guildId }, data: { publishedAt: republishedAt } });

    await runBackfill();

    expect(await prisma.ticketType.count({ where: { guildId } })).toBe(1);
    expect(
      (await prisma.ticketPanel.findUniqueOrThrow({ where: { guildId } })).publishedAt,
    ).toEqual(republishedAt);
    expect(await prisma.ticket.count({ where: { guildId, typeId: types[0]!.id } })).toBe(2);
  });

  it('nomme le type « Support » quand le serveur n’a pas de panel', async () => {
    const guildId = await newGuild();
    await prisma.guildConfig.create({
      data: { guildId, ticketCategoryId: CATEGORY, ticketStaffRoleIds: STAFF_ROLES },
    });

    await runBackfill();

    const types = await prisma.ticketType.findMany({ where: { guildId } });
    expect(types.map((type) => type.name)).toEqual(['Support']);
  });

  it('ne touche ni au serveur sans configuration de tickets, ni à celui qui a déjà un type', async () => {
    const unconfigured = await newGuild();
    await prisma.guildConfig.create({ data: { guildId: unconfigured } });
    const orphan = await ticket(unconfigured, 1, 'OPEN');
    const noConfig = await newGuild();
    const orphanWithoutConfig = await ticket(noConfig, 1, 'CLOSED');

    const migrated = await newGuild();
    await prisma.guildConfig.create({
      data: { guildId: migrated, ticketCategoryId: CATEGORY, ticketStaffRoleIds: STAFF_ROLES },
    });
    const existing = await prisma.ticketType.create({
      data: {
        guildId: migrated,
        name: 'Recrutement',
        categoryId: '100000000000000009',
        staffRoleIds: ['200000000000000009'],
      },
    });

    await runBackfill();
    await runBackfill();

    expect(await prisma.ticketType.count({ where: { guildId: unconfigured } })).toBe(0);
    expect(await prisma.ticketType.count({ where: { guildId: noConfig } })).toBe(0);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: orphan.id } })).typeId).toBe(null);
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: orphanWithoutConfig.id } })).typeId,
    ).toBe(null);
    const types = await prisma.ticketType.findMany({ where: { guildId: migrated } });
    expect(types.map((type) => type.id)).toEqual([existing.id]);
  });
});
