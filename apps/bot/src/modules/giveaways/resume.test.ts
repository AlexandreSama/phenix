import type { Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { resumeGiveaways } from './resume.js';

const database = vi.hoisted(() => ({ findGiveawaysToResume: vi.fn() }));
vi.mock('@phenix/database', () => database);

const endsAt = new Date('2026-11-10T20:00:00Z');
const row = (id: number, overrides: object = {}) => ({
  id,
  endsAt,
  endedAt: null,
  messageId: '900',
  ...overrides,
});

describe('resumeGiveaways', () => {
  it('remet dans la file ce qui reste à faire, d’après la base', async () => {
    database.findGiveawaysToResume.mockResolvedValue([
      row(1), // en cours, déjà publié
      row(2, { messageId: null }), // jamais publié
      // Publication en échec la dernière fois : on réessaie, les droits ont pu être corrigés
      row(3, { messageId: null }),
      row(4, { endedAt: new Date() }), // tiré, pas annoncé
      row(5, { endedAt: new Date(), messageId: null }),
    ]);
    const scheduler = {
      publish: vi.fn(async () => {}),
      scheduleEnd: vi.fn(async () => {}),
      endNow: vi.fn(async () => {}),
    };
    const client = { guilds: { cache: new Map([['100000000000000001', {}]]) } };

    await resumeGiveaways(client as unknown as Client<true>, {} as never, scheduler as never, {
      info: vi.fn(),
    });

    expect(database.findGiveawaysToResume).toHaveBeenCalledWith({}, ['100000000000000001']);
    expect(scheduler.publish.mock.calls).toEqual([[2], [3]]);
    expect(scheduler.scheduleEnd.mock.calls).toEqual([
      [1, endsAt],
      [2, endsAt],
      [3, endsAt],
    ]);
    expect(scheduler.endNow.mock.calls).toEqual([[4], [5]]);
  });
});
