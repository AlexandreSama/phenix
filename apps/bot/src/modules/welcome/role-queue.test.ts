import { describe, expect, it, vi } from 'vitest';
import { createRoleQueue } from './role-queue.js';

const GUILD = '100000000000000001';
const OTHER_GUILD = '100000000000000002';

/** Une tâche qu'on termine à la main, pour observer la concurrence. */
function deferredTask() {
  let finish!: () => void;
  const task = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  return { task, finish: () => finish() };
}

function setup(options: { concurrency?: number; perGuildPerMinute?: number } = {}) {
  let time = 0;
  const logger = { warn: vi.fn(), error: vi.fn() };
  const queue = createRoleQueue({
    concurrency: 2,
    perGuildPerMinute: 60,
    ...options,
    now: () => time,
    logger,
  });
  return { queue, logger, advance: (ms: number) => (time += ms) };
}

describe('createRoleQueue', () => {
  it('ne lance que deux ajouts de rôle à la fois', async () => {
    const { queue } = setup();
    const tasks = [deferredTask(), deferredTask(), deferredTask()];

    for (const { task } of tasks) queue.enqueue(GUILD, task);

    expect(tasks.map(({ task }) => task.mock.calls.length)).toEqual([1, 1, 0]);
    tasks[0]!.finish();
    await vi.waitFor(() => expect(tasks[2]!.task).toHaveBeenCalledOnce());
    tasks[1]!.finish();
    tasks[2]!.finish();
    await queue.idle();
  });

  it('plafonne par serveur et par minute, avec un seul log résumé', async () => {
    const { queue, logger, advance } = setup({ perGuildPerMinute: 2 });
    const task = vi.fn().mockResolvedValue(undefined);

    const accepted = [1, 2, 3, 4].map(() => queue.enqueue(GUILD, task));
    expect(queue.enqueue(OTHER_GUILD, task)).toBe(true);
    await queue.idle();

    expect(accepted).toEqual([true, true, false, false]);
    expect(task).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith({ guildId: GUILD, limit: 2 }, expect.any(String));

    advance(60_000);
    expect(queue.enqueue(GUILD, task)).toBe(true);
    await queue.idle();
  });

  it('une tâche qui échoue ne bloque pas la file', async () => {
    const { queue, logger } = setup({ concurrency: 1 });
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    const next = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(GUILD, failing);
    queue.enqueue(GUILD, next);
    await queue.idle();

    expect(next).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      { guildId: GUILD, error: 'Error' },
      expect.any(String),
    );
  });
});
