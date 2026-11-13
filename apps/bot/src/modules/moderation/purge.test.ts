import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModerationProcessor } from './purge.js';

const database = vi.hoisted(() => ({ purgeCases: vi.fn() }));
vi.mock('@phenix/database', () => database);

const db = {};
const logger = { info: vi.fn(), warn: vi.fn() };
const scheduledAt = new Date('2026-11-14T02:30:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  // le worker traite la tâche juste après son heure prévue
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T02:30:05Z'));
  database.purgeCases.mockResolvedValue({ guilds: 2, cases: 17, skipped: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createModerationProcessor', () => {
  it('purge les sanctions closes à l’heure prévue de la tâche, pas à celle du worker', async () => {
    await createModerationProcessor({ db: db as never, logger })({ name: 'purge', scheduledAt });

    expect(database.purgeCases).toHaveBeenCalledTimes(1);
    expect(database.purgeCases).toHaveBeenCalledWith(db, scheduledAt);
  });

  it('journalise seulement les comptes : aucun identifiant de serveur ni de membre', async () => {
    await createModerationProcessor({ db: db as never, logger })({ name: 'purge', scheduledAt });

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [payload] = logger.info.mock.calls[0] as [Record<string, unknown>, string];
    expect(Object.keys(payload).toSorted()).toEqual(['cases', 'guilds', 'skipped']);
    expect(payload.cases).toBe(17);
    expect(payload.guilds).toBe(2);
    expect(payload.skipped).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('avertit (warn) quand des serveurs sont sautés, toujours sans identifiant', async () => {
    database.purgeCases.mockResolvedValue({ guilds: 1, cases: 4, skipped: 2 });

    await createModerationProcessor({ db: db as never, logger })({ name: 'purge', scheduledAt });

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [payload] = logger.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toEqual({ cases: 4, guilds: 1, skipped: 2 });
  });

  it('purge à « maintenant » une tâche datée dans le futur : elle viserait des sanctions récentes', async () => {
    const now = new Date('2026-11-14T02:30:05Z');
    const future = new Date('2027-11-14T02:30:00Z');

    await createModerationProcessor({ db: db as never, logger })({
      name: 'purge',
      scheduledAt: future,
    });

    expect(database.purgeCases).toHaveBeenCalledWith(db, now);
  });

  it('tolère une avance d’une minute au plus (horloges décalées) avant de prendre « maintenant »', async () => {
    const now = new Date('2026-11-14T02:30:05Z');
    const withinMargin = new Date(now.getTime() + 60_000);
    const beyondMargin = new Date(now.getTime() + 60_001);
    const run = createModerationProcessor({ db: db as never, logger });

    await run({ name: 'purge', scheduledAt: withinMargin });
    await run({ name: 'purge', scheduledAt: beyondMargin });

    expect(database.purgeCases).toHaveBeenNthCalledWith(1, db, withinMargin);
    expect(database.purgeCases).toHaveBeenNthCalledWith(2, db, now);
  });

  it('garde une date passée de 3 h telle quelle : c’est le créneau prévu (worker en retard)', async () => {
    const late = new Date('2026-11-14T02:30:05Z');
    vi.setSystemTime(new Date(late.getTime() + 3 * 3_600_000));

    await createModerationProcessor({ db: db as never, logger })({ name: 'purge', scheduledAt });

    expect(database.purgeCases).toHaveBeenCalledWith(db, scheduledAt);
  });

  it('laisse remonter une erreur : le gestionnaire « failed » du worker la journalise', async () => {
    database.purgeCases.mockRejectedValue(new Error('base indisponible'));

    await expect(
      createModerationProcessor({ db: db as never, logger })({ name: 'purge', scheduledAt }),
    ).rejects.toThrow('base indisponible');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('ne purge pas pour une tâche au nom inconnu : avertit sans erreur ni identifiant', async () => {
    // une future tâche de la file `moderation` ne doit jamais déclencher la purge par défaut
    const job = { name: 'export', scheduledAt } as unknown as Parameters<
      ReturnType<typeof createModerationProcessor>
    >[0];

    await expect(
      createModerationProcessor({ db: db as never, logger })(job),
    ).resolves.toBeUndefined();

    expect(database.purgeCases).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [payload] = logger.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toEqual({ job: 'export' });
  });
});
