import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@phenix/database';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { DiscordService } from './discord/discord.service.js';
import type { Env } from './env.js';
import { GIVEAWAY_QUEUE, TRANSCRIPTS } from './core/tokens.js';

const env: Env = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  API_PORT: 0,
  PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://inutilisee',
  REDIS_URL: 'redis://inutilisee',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_TOKEN: 'token',
  S3_ENDPOINT: 'http://garage.invalid:3900',
  S3_REGION: 'garage',
  S3_ACCESS_KEY_ID: 'cle',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_TRANSCRIPTS_BUCKET: 'transcripts',
};

const MANAGED = '300000000000000001';
const NOT_MANAGED = '300000000000000002';
const CHANNEL = '400000000000000001';
const OTHER_CHANNEL = '400000000000000002';
const GAMER_ROLE = '600000000000000001';
const MOD_ROLE = '600000000000000002';
const BOT_ROLE = '600000000000000009';
const CATEGORY = '400000000000000009';
const SESSION_ID = 'a'.repeat(43);

/** Valkey en mémoire : sessions, cache et publication. */
const store = new Map<string, string>();
const redis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => void store.set(key, value)),
  del: vi.fn(async (key: string) => Number(store.delete(key))),
  publish: vi.fn(async (_channel: string, _message: string) => 1),
  ping: vi.fn(async () => 'PONG'),
  quit: vi.fn(async () => 'OK'),
};

const config = {
  timezone: 'Europe/Paris',
  modLogChannelId: null as string | null,
  announceChannelId: null,
  staffRoleIds: [],
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
};

const publicGuild = {
  id: MANAGED,
  name: 'Les Agents',
  icon: 'abc',
  leftAt: null,
  config: { leaderboardPublic: true },
};

/** Un ticket fermé, avec son transcript dans Garage. */
const ticket = {
  id: 12,
  guildId: MANAGED,
  number: 42,
  channelId: '800000000000000001',
  ownerId: '500000000000000001',
  ownerName: 'Alpha',
  status: 'CLOSED',
  closedById: '500000000000000002',
  closedByName: 'Modo',
  messageCount: 8,
  transcriptKey: `${MANAGED}/ticket-0042.html`,
  createdAt: new Date('2026-11-07T12:00:00Z'),
  closedAt: new Date('2026-11-07T13:00:00Z'),
};
const ticketPanel = {
  guildId: MANAGED,
  channelId: CHANNEL,
  messageId: '700000000000000002',
  title: 'Support',
  description: null,
  buttonLabel: 'Ouvrir un ticket',
  publishedAt: new Date(),
  publishError: null,
};

/** Un giveaway en cours dans CHANNEL, publié, avec 3 participants. */
const giveaway = {
  id: 12,
  guildId: MANAGED,
  channelId: CHANNEL,
  messageId: '700000000000000003',
  hostId: '1',
  prize: 'Nitro',
  winnersCount: 1,
  requiredRoleId: null as string | null,
  endsAt: new Date('2026-11-20T20:00:00Z'),
  endedAt: null as Date | null,
  winnerIds: [] as string[],
  announcedAt: null as Date | null,
  publishedAt: new Date(),
  publishError: null,
  createdAt: new Date('2026-11-09T12:00:00Z'),
  _count: { entries: 3 },
};
/** La file BullMQ, sans Valkey : on regarde les tâches ajoutées. */
const giveawayQueue = {
  add: vi.fn(async () => ({})),
  getJob: vi.fn(async () => undefined),
  remove: vi.fn(async () => 1),
  close: vi.fn(async () => {}),
};

const transcripts = {
  put: vi.fn(),
  getText: vi.fn(async (_key: string): Promise<string | null> => '<!doctype html><p>Bonjour</p>'),
};

const db = {
  $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
  giveaway: {
    count: vi.fn(async () => 1),
    findMany: vi.fn(async () => [giveaway]),
    findUnique: vi.fn(async () => giveaway as typeof giveaway | null),
    create: vi.fn(async ({ data }: { data: object }) => ({
      ...giveaway,
      messageId: null,
      publishedAt: null,
      ...data,
    })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  giveawayEntry: { findMany: vi.fn(async () => []) },
  ticket: {
    count: vi.fn(async () => 25),
    findMany: vi.fn(async () => [ticket]),
    findUnique: vi.fn(async () => ticket as typeof ticket | null),
  },
  ticketPanel: {
    findUnique: vi.fn(async () => ticketPanel as typeof ticketPanel | null),
    upsert: vi.fn(async ({ update }: { update: object }) => ({ ...ticketPanel, ...update })),
  },
  guild: {
    findMany: vi.fn(async () => [{ id: MANAGED }, { id: NOT_MANAGED }]),
    findUnique: vi.fn(async () => publicGuild),
  },
  guildConfig: {
    findUnique: vi.fn(async () => null as object | null),
    upsert: vi.fn(async (args: { update: object }) => ({ ...config, ...args.update })),
    update: vi.fn(async ({ data }: { data: object }) => ({ ...config, ...data })),
  },
  rolePanel: {
    count: vi.fn(async () => 0),
    findUnique: vi.fn(async () => panel),
    findMany: vi.fn(async () => [panel]),
    create: vi.fn(async () => ({ ...panel, messageId: null })),
    update: vi.fn(async () => panel),
    delete: vi.fn(async () => panel),
  },
  memberLevel: {
    count: vi.fn(async () => 1),
    findMany: vi.fn(async () => [
      {
        userId: '500000000000000001',
        displayName: 'Alpha',
        avatarUrl: null,
        level: 4,
        xp: 900,
        messages: 40,
      },
    ]),
  },
  user: { findUnique: vi.fn(), upsert: vi.fn() },
  $queryRaw: vi.fn(async () => [1]),
  $disconnect: vi.fn(),
};

/** Un panel déjà publié dans CHANNEL. */
const panel = {
  id: 7,
  guildId: MANAGED,
  channelId: CHANNEL,
  messageId: '700000000000000001',
  title: 'Tes jeux',
  description: null,
  mode: 'MULTIPLE',
  publishedAt: new Date(),
  publishError: null,
  options: [{ roleId: GAMER_ROLE, label: 'Gamer', emoji: null, position: 0 }],
};

const discord = {
  authorizeUrl: (state: string) => `https://discord.com/oauth2/authorize?state=${state}`,
  getCurrentUserGuilds: vi.fn(async () => [
    { id: MANAGED, name: 'Les Agents', icon: null, owner: false, permissions: '32' },
    { id: NOT_MANAGED, name: 'Autre', icon: null, owner: false, permissions: '0' },
  ]),
  getGuildChannels: vi.fn(async () => [
    { id: CHANNEL, type: 0, name: 'logs', position: 1 },
    { id: OTHER_CHANNEL, type: 0, name: 'roles', position: 2 },
    { id: CATEGORY, type: 4, name: 'Support', position: 0 },
  ]),
  getGuildRoles: vi.fn(async () => [
    { id: MANAGED, name: '@everyone', position: 0, permissions: '0', color: 0, managed: false },
    { id: GAMER_ROLE, name: 'Gamer', position: 2, permissions: '0', color: 0, managed: false },
    {
      id: MOD_ROLE,
      name: 'Modo',
      position: 3,
      permissions: String(1n << 40n),
      color: 0,
      managed: false,
    },
    { id: BOT_ROLE, name: 'PhenixMG', position: 5, permissions: '8', color: 0, managed: true },
    {
      id: '600000000000000003',
      name: 'Admin',
      position: 9,
      permissions: '8',
      color: 0,
      managed: false,
    },
  ]),
  getBotMember: vi.fn(async () => ({ roles: [BOT_ROLE] })),
};

let app: NestExpressApplication;
const cookie = `sid=${SESSION_ID}`;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(env)] })
    .overrideProvider(PrismaClient)
    .useValue(db)
    .overrideProvider(Redis)
    .useValue(redis)
    .overrideProvider(DiscordService)
    .useValue(discord)
    .overrideProvider(GIVEAWAY_QUEUE)
    .useValue(giveawayQueue)
    .overrideProvider(TRANSCRIPTS)
    .useValue(transcripts)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  store.clear();
  store.set(`session:${SESSION_ID}`, JSON.stringify({ userId: '1', accessToken: 'tok' }));
  vi.clearAllMocks();
});

describe('connexion', () => {
  it('envoie vers Discord avec un state gardé en cookie', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/discord');

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize/);
    expect(response.headers['set-cookie']?.[0]).toMatch(/^oauth_state=.+HttpOnly; SameSite=Lax/);
  });

  it('refuse un retour dont le state ne correspond pas', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/discord/callback?code=abc&state=faux')
      .set('Cookie', 'oauth_state=vrai');

    expect(response.headers.location).toBe('http://localhost:5173/?connexion=refusee');
  });

  it('demande une session pour /auth/me', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/me');
    expect(response.status).toBe(401);
  });
});

describe('config d’un serveur', () => {
  it('refuse un serveur que l’utilisateur ne gère pas', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/guilds/${NOT_MANAGED}/config`)
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
  });

  it('refuse un corps mal formé avec le message du schéma partagé', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/guilds/${MANAGED}/config`)
      .set('Cookie', cookie)
      .send({ modLogChannelId: 'abc' });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(['modLogChannelId: ID Discord invalide']);
  });

  it('refuse un salon qui n’appartient pas au serveur', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/guilds/${MANAGED}/config`)
      .set('Cookie', cookie)
      .send({ modLogChannelId: '400000000000000999' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Salon inconnu sur ce serveur');
  });

  it('enregistre la config et prévient le bot', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/guilds/${MANAGED}/config`)
      .set('Cookie', cookie)
      .send({ modLogChannelId: CHANNEL });

    expect(response.status).toBe(200);
    expect(response.body.modLogChannelId).toBe(CHANNEL);
    expect(redis.publish).toHaveBeenCalledWith(
      'bot:events',
      JSON.stringify({ type: 'config.updated', guildId: MANAGED }),
    );
  });
});

describe('réglages XP', () => {
  it('vérifie min ≤ max avec la valeur déjà enregistrée', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/guilds/${MANAGED}/leveling`)
      .set('Cookie', cookie)
      .send({ xpMin: 40 }); // le maximum enregistré est 25

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual([
      "Le minimum d'XP doit être inférieur ou égal au maximum",
    ]);
    expect(db.guildConfig.update).not.toHaveBeenCalled();
  });

  it('enregistre les réglages et prévient le bot', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/guilds/${MANAGED}/leveling`)
      .set('Cookie', cookie)
      .send({ xpMin: 20, xpMax: 40, levelUpChannelId: CHANNEL });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ xpMin: 20, xpMax: 40, levelUpChannelId: CHANNEL });
    expect(redis.publish).toHaveBeenCalledOnce();
  });
});

describe('classement public', () => {
  it('répond sans connexion, et sert la même page depuis le cache', async () => {
    const first = await request(app.getHttpServer()).get(`/api/leaderboard/${MANAGED}?page=1`);
    const second = await request(app.getHttpServer()).get(`/api/leaderboard/${MANAGED}`);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      guild: { name: 'Les Agents', iconUrl: expect.stringContaining('/icons/') },
      entries: [{ rank: 1, displayName: 'Alpha', level: 4 }],
      page: 1,
      pageCount: 1,
    });
    expect(second.body).toEqual(first.body);
    expect(db.memberLevel.findMany).toHaveBeenCalledOnce();
  });

  it('répond 404 quand le classement est privé', async () => {
    db.guild.findUnique.mockResolvedValueOnce({
      ...publicGuild,
      config: { leaderboardPublic: false },
    });

    const response = await request(app.getHttpServer()).get(`/api/leaderboard/${MANAGED}`);

    expect(response.status).toBe(404);
  });

  it('refuse une page qui n’est pas un nombre positif', async () => {
    const response = await request(app.getHttpServer()).get(`/api/leaderboard/${MANAGED}?page=0`);
    expect(response.status).toBe(400);
  });
});

describe('panels de rôles', () => {
  const input = {
    title: 'Tes jeux',
    description: null,
    channelId: CHANNEL,
    mode: 'MULTIPLE',
    options: [{ roleId: GAMER_ROLE, label: 'Gamer', emoji: '🎮' }],
  };

  it('dit pour chaque rôle si le bot peut le distribuer', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/roles`)
      .set('Cookie', cookie);

    expect(
      response.body.map((role: { name: string; blockedReason: string | null }) => [
        role.name,
        role.blockedReason,
      ]),
    ).toEqual([
      ['Admin', 'Placé au-dessus du rôle du bot'],
      ['Modo', 'Donne des droits de modération ou d’administration'],
      ['Gamer', null],
    ]);
  });

  it('refuse un rôle que le bot ne peut pas distribuer', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/guilds/${MANAGED}/role-panels`)
      .set('Cookie', cookie)
      .send({ ...input, options: [{ roleId: MOD_ROLE, label: 'Modo', emoji: null }] });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual([
      'Le rôle « Modo » ne peut pas être distribué : Donne des droits de modération ou d’administration',
    ]);
    expect(db.rolePanel.create).not.toHaveBeenCalled();
  });

  it('crée un panel et demande au bot de le publier', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/guilds/${MANAGED}/role-panels`)
      .set('Cookie', cookie)
      .send(input);

    expect(response.status).toBe(201);
    expect(redis.publish).toHaveBeenCalledWith(
      'bot:events',
      JSON.stringify({ type: 'rolePanel.publish', panelId: 7 }),
    );
  });

  it('retire l’ancien message quand le panel change de salon', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/guilds/${MANAGED}/role-panels/7`)
      .set('Cookie', cookie)
      .send({ ...input, channelId: OTHER_CHANNEL });

    expect(response.status).toBe(200);
    expect(redis.publish.mock.calls.map(([, message]) => JSON.parse(message).type)).toEqual([
      'rolePanel.delete',
      'rolePanel.publish',
    ]);
  });

  it('répond 404 pour le panel d’un autre serveur, comme pour un panel inexistant', async () => {
    db.rolePanel.findUnique.mockResolvedValueOnce({ ...panel, guildId: NOT_MANAGED });

    const other = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/role-panels/7`)
      .set('Cookie', cookie);
    const unreadable = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/role-panels/abc`)
      .set('Cookie', cookie);

    expect([other.status, unreadable.status]).toEqual([404, 404]);
  });
});

describe('tickets', () => {
  const settings = {
    categoryId: CATEGORY,
    staffRoleIds: [MOD_ROLE],
    logChannelId: null,
    panel: { channelId: CHANNEL, title: 'Support', description: null, buttonLabel: 'Ouvrir' },
  };

  it('liste les catégories, où s’ouvrent les tickets', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/categories`)
      .set('Cookie', cookie);

    expect(response.body).toEqual([{ id: CATEGORY, name: 'Support' }]);
  });

  it('répond settings: null tant que rien n’est réglé', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/tickets/settings`)
      .set('Cookie', cookie);

    expect(response.body).toEqual({ settings: null });
  });

  it('refuse une catégorie et un rôle qui ne sont pas sur ce serveur', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/guilds/${MANAGED}/tickets/settings`)
      .set('Cookie', cookie)
      .send({ ...settings, categoryId: CHANNEL, staffRoleIds: ['600000000000000099'] });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual([
      'Catégorie inconnue sur ce serveur',
      'Rôle inconnu sur ce serveur',
    ]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('enregistre en une transaction, retire l’ancien panel et publie le nouveau', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/guilds/${MANAGED}/tickets/settings`)
      .set('Cookie', cookie)
      .send({ ...settings, panel: { ...settings.panel, channelId: OTHER_CHANNEL } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ categoryId: CATEGORY, panelStatus: 'pending' });
    expect(db.ticketPanel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ messageId: null }) }),
    );
    expect(redis.publish.mock.calls.map(([, message]) => JSON.parse(message).type)).toEqual([
      'config.updated',
      'ticketPanel.delete',
      'ticketPanel.publish',
    ]);
  });

  it('liste les tickets fermés du plus récent au plus ancien, par page', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/tickets?status=closed&page=2`)
      .set('Cookie', cookie);

    expect(response.body).toMatchObject({ page: 2, pageCount: 2, total: 25 });
    expect(response.body.tickets[0]).toMatchObject({ number: 42, hasTranscript: true });
    expect(db.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { closedAt: 'desc' }, skip: 20, take: 20 }),
    );
  });

  it('sert le transcript sous une politique de sécurité stricte', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/tickets/12/transcript`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain('sandbox');
    expect(response.headers['content-disposition']).toBe('inline; filename="ticket-0042.html"');
    expect(response.text).toBe('<!doctype html><p>Bonjour</p>');
    expect(transcripts.getText).toHaveBeenCalledWith(`${MANAGED}/ticket-0042.html`);
  });

  it('répond 404 en JSON pour le ticket d’un autre serveur ou sans transcript', async () => {
    db.ticket.findUnique.mockResolvedValueOnce({ ...ticket, guildId: NOT_MANAGED });
    const other = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/tickets/12/transcript`)
      .set('Cookie', cookie);

    db.ticket.findUnique.mockResolvedValueOnce({ ...ticket, transcriptKey: null } as never);
    const none = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/tickets/12/transcript`)
      .set('Cookie', cookie);

    expect([other.status, none.status]).toEqual([404, 404]);
    expect(other.headers['content-type']).toContain('application/json');
    expect(transcripts.getText).not.toHaveBeenCalled();
  });
});

const tomorrow = () => new Date(Date.now() + 86_400_000);
const giveawayInput = () => ({
  channelId: CHANNEL,
  prize: 'Nitro',
  winnersCount: 2,
  endsAt: tomorrow().toISOString(),
  requiredRoleId: GAMER_ROLE,
});
const jobs = () => giveawayQueue.add.mock.calls as unknown as [string, object, object?][];

describe('giveaways', () => {
  const url = `/api/guilds/${MANAGED}/giveaways`;

  it('liste les giveaways en cours, la fin la plus proche d’abord', async () => {
    const response = await request(app.getHttpServer()).get(url).set('Cookie', cookie);

    expect(response.body).toMatchObject({ page: 1, pageCount: 1, total: 1 });
    expect(response.body.giveaways[0]).toMatchObject({
      id: 12,
      entryCount: 3,
      announced: false,
      publication: 'published',
      winners: [],
    });
    expect(db.giveaway.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId: MANAGED, endedAt: null },
        orderBy: { endsAt: 'asc' },
      }),
    );
  });

  it('crée le giveaway au nom de l’admin connecté, puis confie publication et tirage à la file', async () => {
    const body = giveawayInput();
    const response = await request(app.getHttpServer()).post(url).set('Cookie', cookie).send(body);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ prize: 'Nitro', entryCount: 0, publication: 'pending' });
    expect(db.giveaway.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hostId: '1', winnersCount: 2, requiredRoleId: GAMER_ROLE }),
    });
    expect(jobs()).toEqual([
      ['publish', { giveawayId: 12 }, { jobId: 'publish-12', delay: 0 }],
      ['end', { giveawayId: 12 }, { jobId: 'end-12', delay: expect.any(Number) }],
    ]);
    const [, , endOptions] = jobs()[1] ?? [];
    const { delay } = endOptions as { delay: number };
    expect(delay).toBeGreaterThan(86_000_000);
    expect(delay).toBeLessThanOrEqual(86_400_000);
  });

  it('refuse une fin trop proche, un salon et un rôle inconnus', async () => {
    const response = await request(app.getHttpServer())
      .post(url)
      .set('Cookie', cookie)
      .send({
        ...giveawayInput(),
        endsAt: new Date(Date.now() + 10_000).toISOString(),
        channelId: '400000000000000099',
        requiredRoleId: '600000000000000099',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual([
      'La fin doit être dans une minute au moins',
      'Salon inconnu sur ce serveur',
      'Rôle inconnu sur ce serveur',
    ]);
    expect(db.giveaway.create).not.toHaveBeenCalled();
    expect(giveawayQueue.add).not.toHaveBeenCalled();
  });

  it('« Terminer » avance le tirage ; refusé une fois le giveaway annoncé', async () => {
    const ok = await request(app.getHttpServer()).post(`${url}/12/end`).set('Cookie', cookie);
    db.giveaway.findUnique.mockResolvedValueOnce({
      ...giveaway,
      endedAt: new Date(),
      announcedAt: new Date(),
    });
    const done = await request(app.getHttpServer()).post(`${url}/12/end`).set('Cookie', cookie);

    expect([ok.status, done.status]).toEqual([202, 409]);
    // La date de fin devient maintenant : le site affiche « tirage en cours »
    expect(db.giveaway.updateMany).toHaveBeenCalledOnce();
    expect(db.giveaway.updateMany).toHaveBeenCalledWith({
      where: { id: 12, endedAt: null },
      data: { endsAt: expect.any(Date) },
    });
    expect(jobs()).toEqual([['end', { giveawayId: 12 }, { jobId: 'end-12' }]]);
  });

  it('« Relancer » attend un tirage fait et annoncé', async () => {
    const early = await request(app.getHttpServer()).post(`${url}/12/reroll`).set('Cookie', cookie);
    db.giveaway.findUnique.mockResolvedValueOnce({
      ...giveaway,
      endedAt: new Date(),
      announcedAt: new Date(),
    });
    const ok = await request(app.getHttpServer()).post(`${url}/12/reroll`).set('Cookie', cookie);

    expect([early.status, ok.status]).toEqual([409, 202]);
    expect(early.body.message).toBe("Ce giveaway n'est pas encore terminé");
    expect(jobs()).toEqual([['reroll', { giveawayId: 12 }, { jobId: 'reroll-12' }]]);
  });

  it('supprime, annule les tâches en attente et fait retirer le message', async () => {
    const response = await request(app.getHttpServer()).delete(`${url}/12`).set('Cookie', cookie);

    expect(response.status).toBe(204);
    expect(db.giveaway.deleteMany).toHaveBeenCalledWith({ where: { id: 12 } });
    expect(giveawayQueue.remove.mock.calls).toEqual([['end-12'], ['publish-12']]);
    expect(jobs()).toEqual([['remove', { channelId: CHANNEL, messageId: '700000000000000003' }]]);
  });

  it('répond 404 pour le giveaway d’un autre serveur, ou un ID illisible', async () => {
    db.giveaway.findUnique.mockResolvedValueOnce({ ...giveaway, guildId: NOT_MANAGED });
    const other = await request(app.getHttpServer()).delete(`${url}/12`).set('Cookie', cookie);
    const unreadable = await request(app.getHttpServer())
      .post(`${url}/abc/end`)
      .set('Cookie', cookie);

    expect([other.status, unreadable.status]).toEqual([404, 404]);
    expect(db.giveaway.deleteMany).not.toHaveBeenCalled();
  });
});

describe('santé', () => {
  it('répond ok quand la base et Valkey répondent', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');
    expect(response.body).toEqual({ status: 'ok' });
  });
});
