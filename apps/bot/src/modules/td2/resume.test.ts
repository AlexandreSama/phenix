import type { Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { resumeTd2Events } from './resume.js';

const database = vi.hoisted(() => ({ findTd2EventsToResume: vi.fn() }));
vi.mock('@phenix/database', () => database);

describe('resumeTd2Events', () => {
  it('s’assure que chaque sortie à venir a ses tâches, sans rien remplacer', async () => {
    const saturday = new Date('2026-11-14T20:00:00Z');
    const sunday = new Date('2026-11-15T19:00:00Z');
    database.findTd2EventsToResume.mockResolvedValue([
      { id: 12, scheduledAt: saturday },
      { id: 13, scheduledAt: sunday },
    ]);
    const scheduler = { ensure: vi.fn(async () => {}), schedule: vi.fn(), cancel: vi.fn() };
    const client = { guilds: { cache: new Map([['100000000000000001', {}]]) } };

    await resumeTd2Events(client as unknown as Client<true>, {} as never, scheduler, {
      info: vi.fn(),
    });

    expect(database.findTd2EventsToResume).toHaveBeenCalledWith({}, ['100000000000000001']);
    expect(scheduler.ensure.mock.calls).toEqual([
      [12, saturday],
      [13, sunday],
    ]);
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });
});
