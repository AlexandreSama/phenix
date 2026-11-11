import type { CommandUsageEntry } from '@phenix/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommandUsageRecorder, fullCommandName } from './command-usage.js';

const NOW = new Date('2026-11-11T09:42:10Z');
const HOUR = new Date('2026-11-11T09:00:00Z');

function setup(write = vi.fn(async (_entries: CommandUsageEntry[]) => {})) {
  const logger = { warn: vi.fn() };
  let now = NOW;
  const recorder = createCommandUsageRecorder({
    write,
    logger,
    intervalMs: 60_000,
    now: () => now,
    maxEntries: 3,
  });
  return { recorder, write, logger, setNow: (date: Date) => (now = date) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCommandUsageRecorder', () => {
  it('cumule en mémoire et écrit un seul lot par minute', async () => {
    const { recorder, write } = setup();
    recorder.record({ guildId: '1', command: 'ping', durationMs: 40.4, ok: true });
    recorder.record({ guildId: '1', command: 'ping', durationMs: 60, ok: false });
    recorder.record({ guildId: null, command: 'avatar', durationMs: 10, ok: true });

    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([
      { hour: HOUR, guildId: '1', command: 'ping', count: 2, errors: 1, totalDurationMs: 100 },
      { hour: HOUR, guildId: '', command: 'avatar', count: 1, errors: 0, totalDurationMs: 10 },
    ]);

    // Rien de neuf : pas d'écriture vide
    await vi.advanceTimersByTimeAsync(60_000);
    expect(write).toHaveBeenCalledTimes(1);
    await recorder.stop();
  });

  it('sépare les heures', async () => {
    const { recorder, write, setNow } = setup();
    recorder.record({ guildId: '1', command: 'ping', durationMs: 1, ok: true });
    setNow(new Date('2026-11-11T10:00:01Z'));
    recorder.record({ guildId: '1', command: 'ping', durationMs: 1, ok: true });

    await recorder.flush();

    expect(write.mock.calls[0]?.[0].map((entry) => entry.hour.toISOString())).toEqual([
      '2026-11-11T09:00:00.000Z',
      '2026-11-11T10:00:00.000Z',
    ]);
    await recorder.stop();
  });

  it('une écriture en échec ne lève rien, et le lot repart au suivant avec les nouveaux comptes', async () => {
    const write = vi
      .fn(async (_entries: CommandUsageEntry[]) => {})
      .mockRejectedValueOnce(new Error('base injoignable'));
    const { recorder, logger } = setup(write);
    recorder.record({ guildId: '1', command: 'ping', durationMs: 5, ok: true });

    await expect(recorder.flush()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entries: 1 }),
      expect.any(String),
    );

    recorder.record({ guildId: '1', command: 'ping', durationMs: 5, ok: true });
    await recorder.flush();
    expect(write).toHaveBeenLastCalledWith([
      expect.objectContaining({ command: 'ping', count: 2, totalDurationMs: 10 }),
    ]);
    await recorder.stop();
  });

  it('plafonne la mémoire quand la base reste injoignable', async () => {
    const write = vi.fn(async (_entries: CommandUsageEntry[]) => {
      throw new Error('base injoignable');
    });
    const { recorder } = setup(write);
    for (const command of ['a', 'b', 'c', 'd', 'e']) {
      recorder.record({ guildId: '1', command, durationMs: 1, ok: true });
    }
    // Une commande déjà comptée continue de cumuler
    recorder.record({ guildId: '1', command: 'a', durationMs: 1, ok: true });
    await recorder.flush();

    expect(write.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ command: 'a', count: 2 }),
      expect.objectContaining({ command: 'b' }),
      expect.objectContaining({ command: 'c' }),
    ]);
    await recorder.stop();
  });

  it('écrit un dernier lot à l’arrêt, puis plus rien', async () => {
    const { recorder, write } = setup();
    recorder.record({ guildId: '1', command: 'ping', durationMs: 1, ok: true });

    await recorder.stop();
    expect(write).toHaveBeenCalledTimes(1);

    recorder.record({ guildId: '1', command: 'ping', durationMs: 1, ok: true });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('n’écrit jamais deux lots en même temps', async () => {
    let release: () => void = () => {};
    const write = vi.fn(
      (_entries: CommandUsageEntry[]) => new Promise<void>((resolve) => (release = resolve)),
    );
    const { recorder } = setup(write);
    recorder.record({ guildId: '1', command: 'a', durationMs: 1, ok: true });
    const first = recorder.flush();
    recorder.record({ guildId: '1', command: 'b', durationMs: 1, ok: true });
    const second = recorder.flush();

    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(2);
    release();
    await second;
    await recorder.stop();
  });
});

describe('fullCommandName', () => {
  const interaction = (group: string | null, sub: string | null) => ({
    commandName: 'td2',
    options: { getSubcommandGroup: () => group, getSubcommand: () => sub },
  });

  it('ajoute le groupe et la sous-commande', () => {
    expect(fullCommandName(interaction(null, null) as never)).toBe('td2');
    expect(fullCommandName(interaction(null, 'mission') as never)).toBe('td2 mission');
    expect(fullCommandName(interaction('signalement', 'voir') as never)).toBe(
      'td2 signalement voir',
    );
  });
});
