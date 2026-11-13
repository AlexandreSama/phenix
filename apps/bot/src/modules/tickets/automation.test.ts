import { Events } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { registerTicketAutomation } from './automation.js';

const database = vi.hoisted(() => ({
  findInactivityCandidates: vi.fn(),
  touchTicketActivity: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const jobs = vi.hoisted(() => {
  const queue = { on: vi.fn(), close: vi.fn(async () => {}) };
  const worker = { on: vi.fn(), run: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  return {
    queue,
    worker,
    createTicketQueue: vi.fn((_url: string) => queue),
    createTicketWorker: vi.fn(
      (_url: string, _processor: (job: unknown) => Promise<void>) => worker,
    ),
    ensureTicketSchedules: vi.fn(async (_queue: unknown) => {}),
  };
});
vi.mock('@phenix/jobs', () => jobs);

const REDIS = 'redis://valkey:6379';

function setup() {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const context = { db: { tag: 'db' }, logger } as unknown as BotContext;
  const client = { on: vi.fn(), channels: { fetch: vi.fn() }, users: {} };
  const automation = registerTicketAutomation({
    client: client as never,
    context,
    redisUrl: REDIS,
  });
  return { automation, client, context, logger };
}

/** Le handler branché sur cet événement du client (un seul attendu). */
const handlerOf = (client: ReturnType<typeof setup>['client'], event: string) => {
  const calls = client.on.mock.calls.filter(([name]) => name === event);
  expect(calls).toHaveLength(1);
  return calls[0]![1] as (...args: unknown[]) => Promise<void>;
};

beforeEach(() => {
  vi.clearAllMocks();
  database.findInactivityCandidates.mockResolvedValue([]);
  database.touchTicketActivity.mockResolvedValue(true);
  jobs.ensureTicketSchedules.mockResolvedValue(undefined);
  jobs.worker.run.mockResolvedValue(undefined);
});

describe('registerTicketAutomation (câblage de index.ts)', () => {
  it('branche le suivi d’activité sur MessageCreate : un message de membre repousse le délai', async () => {
    const { client } = setup();

    const onMessage = handlerOf(client, Events.MessageCreate);
    await onMessage({
      inGuild: () => true,
      author: { bot: false },
      system: false,
      channelId: 'ch1',
    });

    expect(database.touchTicketActivity).toHaveBeenCalledWith({ tag: 'db' }, 'ch1');
  });

  it('crée la file et le worker sur Valkey, avec le processeur de la fermeture automatique', async () => {
    setup();

    expect(jobs.createTicketQueue).toHaveBeenCalledWith(REDIS);
    expect(jobs.createTicketWorker).toHaveBeenCalledWith(REDIS, expect.any(Function));
    const processor = jobs.createTicketWorker.mock.calls[0]![1];
    const scheduledAt = new Date('2026-11-13T10:00:00Z');
    await processor({ name: 'inactivity', scheduledAt });

    expect(database.findInactivityCandidates).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({ now: expect.any(Date) }),
    );
  });

  it('écoute les erreurs de la file et du worker (sans écouteur, Valkey coupé ferait planter)', () => {
    setup();

    expect(jobs.queue.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(jobs.worker.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(jobs.worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('un passage en échec est journalisé avec le code seulement, jamais l’erreur complète', () => {
    const { logger } = setup();
    const failed = jobs.worker.on.mock.calls.find(([event]) => event === 'failed')![1] as (
      job: unknown,
      err: unknown,
    ) => void;

    failed({ name: 'inactivity' }, Object.assign(new Error('<@123> secret'), { code: 'P1001' }));

    expect(logger.warn).toHaveBeenCalledWith(
      { job: 'inactivity', code: 'P1001' },
      'Ticket inactivity pass failed',
    );
  });

  it('ne planifie ni ne démarre rien avant start() (le bot doit être connecté à Discord)', () => {
    setup();

    expect(jobs.ensureTicketSchedules).not.toHaveBeenCalled();
    expect(jobs.worker.run).not.toHaveBeenCalled();
  });

  it('start() planifie la tâche répétée sur la file et démarre le worker', () => {
    const { automation } = setup();

    automation.start();

    expect(jobs.ensureTicketSchedules).toHaveBeenCalledWith(jobs.queue);
    expect(jobs.worker.run).toHaveBeenCalledTimes(1);
  });

  it('start() : une planification ou un worker en échec est journalisé, jamais levé', async () => {
    const { automation, logger } = setup();
    jobs.ensureTicketSchedules.mockRejectedValue(new Error('Valkey HS'));
    jobs.worker.run.mockRejectedValue(new Error('Valkey HS'));

    expect(() => automation.start()).not.toThrow();
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(2));
  });

  it('stop() ferme le worker (tâche en cours terminée) puis la file', async () => {
    const { automation } = setup();

    await automation.stop();

    expect(jobs.worker.close).toHaveBeenCalledTimes(1);
    expect(jobs.queue.close).toHaveBeenCalledTimes(1);
    expect(jobs.worker.close.mock.invocationCallOrder[0]).toBeLessThan(
      jobs.queue.close.mock.invocationCallOrder[0]!,
    );
  });
});
