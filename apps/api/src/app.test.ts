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
import { EVIDENCE, GIVEAWAY_QUEUE, MEDIA, TRANSCRIPTS } from './core/tokens.js';
import sharp from 'sharp';

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
  S3_EVIDENCE_BUCKET: 'evidence',
  S3_MEDIA_BUCKET: 'media',
  BOT_OWNER_IDS: ['900000000000000001'],
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
/** Une seconde session, celle d'un propriétaire du bot (BOT_OWNER_IDS). */
const OWNER_SESSION_ID = 'o'.repeat(43);

/** Valkey en mémoire : sessions, cache et publication. */
const store = new Map<string, string>();
const redis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => void store.set(key, value)),
  del: vi.fn(async (key: string) => Number(store.delete(key))),
  publish: vi.fn(async (_channel: string, _message: string) => 1),
  ping: vi.fn(async () => 'PONG'),
  quit: vi.fn(async () => 'OK'),
  // Les limites de débit du forum : un compteur par clé
  incr: vi.fn(async (key: string) => {
    const count = Number(store.get(key) ?? 0) + 1;
    store.set(key, String(count));
    return count;
  }),
  expire: vi.fn(async () => 1),
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
  td2ChannelId: null as string | null,
  td2ReportChannelId: null as string | null,
  td2ReportViewerRoleIds: [] as string[],
  td2ReportFeedChannelId: null as string | null,
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

/** Une sortie Dark Hours samedi soir : 3 confirmés sur 8, 1 en réserve. */
const td2Event = {
  id: 12,
  scheduledAt: new Date('2026-11-14T20:00:00Z'),
  channelId: CHANNEL,
  mode: { name: 'Normal', activity: { kind: 'RAID', name: 'Dark Hours' } },
  slots: [{ count: 6 }, { count: 1 }, { count: 1 }],
  signups: [
    { status: 'CONFIRMED' },
    { status: 'CONFIRMED' },
    { status: 'CONFIRMED' },
    { status: 'RESERVE' },
  ],
};

/** Le catalogue : un raid, un mode qui a déjà servi à 2 sorties. */
const td2Activity = {
  id: 1,
  kind: 'RAID',
  name: 'Dark Hours',
  active: true,
  modes: [
    {
      id: 3,
      activityId: 1,
      name: 'Normal',
      slots: [
        { modeId: 3, role: 'DPS', count: 6 },
        { modeId: 3, role: 'HEAL', count: 1 },
        { modeId: 3, role: 'TANK', count: 1 },
      ],
      _count: { events: 2 },
    },
  ],
};
/** Un signalement fait sur MANAGED, confirmé, avec deux captures dans le bucket des preuves. */
const td2Report = {
  id: 7,
  guildId: MANAGED,
  guild: { name: 'Les Agents' },
  reporterId: '500000000000000001',
  playerName: 'Agent47',
  playerNameLower: 'agent47',
  platform: 'PSN',
  reason: 'CHEAT',
  details: 'Tir à travers les murs',
  evidenceKeys: ['td2-reports/a.png', 'td2-reports/b.png'],
  status: 'CONFIRMED',
  reviewedById: '8',
  reviewedAt: new Date('2026-11-10T13:00:00Z'),
  staffMessageId: '700000000000000007',
  createdAt: new Date('2026-11-10T12:00:00Z'),
};
const evidence = {
  put: vi.fn(),
  getText: vi.fn(),
  getBytes: vi.fn(async (_key: string) => ({
    body: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    contentType: 'image/png' as string | null,
  })),
  delete: vi.fn(async (_keys: readonly string[]) => {}),
};

const transcripts = {
  put: vi.fn(),
  getText: vi.fn(async (_key: string): Promise<string | null> => '<!doctype html><p>Bonjour</p>'),
};

/** Le forum : une catégorie, un sujet de deux messages, deux auteurs. */
const FORUM_MEMBER = '1';
const FORUM_OTHER = '700000000000000002';
const FORUM_MODERATOR = '700000000000000003';
const MOD_SESSION_ID = 'm'.repeat(43);
const forumUsers: Record<string, { id: string; role: 'MEMBER' | 'MODERATOR' | 'ADMIN' }> = {
  [FORUM_MEMBER]: { id: FORUM_MEMBER, role: 'MEMBER' },
  [FORUM_OTHER]: { id: FORUM_OTHER, role: 'MEMBER' },
  [FORUM_MODERATOR]: { id: FORUM_MODERATOR, role: 'MODERATOR' },
  '900000000000000001': { id: '900000000000000001', role: 'MEMBER' },
};
const forumAuthor = (id: string, username: string) => ({
  id,
  username,
  avatar: null,
  role: 'MEMBER',
});
const forumCategory = {
  id: 2,
  slug: 'entraide',
  name: 'Entraide',
  description: 'Builds et conseils',
  position: 0,
};
const forumThread = {
  id: 10,
  categoryId: 2,
  authorId: FORUM_MEMBER,
  title: 'Build tank pour Dark Hours',
  pinned: false,
  locked: false,
  createdAt: new Date('2026-11-10T12:00:00Z'),
  updatedAt: new Date('2026-11-10T13:00:00Z'),
  category: { id: 2, slug: 'entraide', name: 'Entraide' },
  author: forumAuthor(FORUM_MEMBER, 'Agent'),
  _count: { posts: 2 },
};
const forumPosts = [
  {
    id: 100,
    threadId: 10,
    authorId: FORUM_MEMBER,
    content: 'Quel set ? <script>alert(1)</script>',
    editedAt: null,
    createdAt: new Date('2026-11-10T12:00:00Z'),
    author: forumAuthor(FORUM_MEMBER, 'Agent'),
  },
  {
    id: 101,
    threadId: 10,
    authorId: FORUM_OTHER,
    content: 'Le **Foundry**, sans hésiter.',
    editedAt: null,
    createdAt: new Date('2026-11-10T13:00:00Z'),
    author: forumAuthor(FORUM_OTHER, 'Faye'),
  },
];
const media = {
  put: vi.fn(async () => {}),
  getText: vi.fn(),
  getBytes: vi.fn(async (_key: string) => ({
    body: Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
    contentType: 'image/webp' as string | null,
  })),
  delete: vi.fn(async (_keys: readonly string[]) => {}),
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
  user: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(async () => [] as object[]),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  td2Event: { findMany: vi.fn(async () => [td2Event]), count: vi.fn(async () => 2) },
  td2Activity: {
    findMany: vi.fn(async () => [td2Activity]),
    findUnique: vi.fn(async () => td2Activity as object | null),
    findUniqueOrThrow: vi.fn(async () => td2Activity),
    createMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => td2Activity),
  },
  td2ActivityMode: {
    findUnique: vi.fn(async () => td2Activity.modes[0] as object | null),
    create: vi.fn(async () => td2Activity.modes[0]),
    update: vi.fn(async () => td2Activity.modes[0]),
    delete: vi.fn(async () => td2Activity.modes[0]),
  },
  td2Report: {
    findMany: vi.fn(async () => [td2Report]),
    findUnique: vi.fn(async () => td2Report as typeof td2Report | null),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  forumCategory: {
    findMany: vi.fn(async () => [{ ...forumCategory, _count: { threads: 1 } }]),
    findUnique: vi.fn(async ({ where }: { where: { slug?: string; id?: number } }) =>
      where.slug === 'entraide' || where.id === 2 ? forumCategory : null,
    ),
    findFirst: vi.fn(async () => null as object | null),
    createMany: vi.fn(async () => ({ count: 1 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    delete: vi.fn(async () => forumCategory),
  },
  forumThread: {
    groupBy: vi.fn(async () => [{ categoryId: 2, _max: { updatedAt: forumThread.updatedAt } }]),
    findMany: vi.fn(async () => [forumThread]),
    count: vi.fn(async () => 1),
    findUnique: vi.fn(async () => forumThread as typeof forumThread | null),
    create: vi.fn(async () => ({ id: 11, posts: [{ id: 110 }] })),
    update: vi.fn(async () => forumThread),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  forumPost: {
    findMany: vi.fn(async () => forumPosts),
    count: vi.fn(async () => 2),
    findFirst: vi.fn(async () => ({ id: 100 })),
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
      const post = forumPosts.find((entry) => entry.id === where.id);
      return post ? { ...post, thread: { id: 10, locked: forumThread.locked } } : null;
    }),
    create: vi.fn(async () => ({ id: 102 })),
    update: vi.fn(async () => forumPosts[0]),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  forumAttachment: {
    create: vi.fn(async ({ data }: { data: object }) => data),
    findUnique: vi.fn(async () => ({ key: 'forum/image.webp' }) as { key: string } | null),
    findMany: vi.fn(async () => [{ key: 'forum/a.webp' }]),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
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
    .overrideProvider(EVIDENCE)
    .useValue(evidence)
    .overrideProvider(MEDIA)
    .useValue(media)
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
  store.set(
    `session:${OWNER_SESSION_ID}`,
    JSON.stringify({ userId: '900000000000000001', accessToken: 'tok' }),
  );
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

describe('TD2', () => {
  const url = `/api/guilds/${MANAGED}/td2`;
  const settings = {
    channelId: CHANNEL,
    reportChannelId: OTHER_CHANNEL,
    reportViewerRoleIds: [GAMER_ROLE],
    reportFeedChannelId: null,
  };

  it('lit les réglages, vides par défaut', async () => {
    const response = await request(app.getHttpServer())
      .get(`${url}/settings`)
      .set('Cookie', cookie);

    expect(response.body).toEqual({
      channelId: null,
      reportChannelId: null,
      reportViewerRoleIds: [],
      reportFeedChannelId: null,
    });
  });

  it('enregistre les salons et les rôles, puis prévient le bot', async () => {
    const response = await request(app.getHttpServer())
      .put(`${url}/settings`)
      .set('Cookie', cookie)
      .send(settings);

    expect(response.body).toEqual(settings);
    expect(db.guildConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          td2ChannelId: CHANNEL,
          td2ReportChannelId: OTHER_CHANNEL,
          td2ReportViewerRoleIds: [GAMER_ROLE],
          td2ReportFeedChannelId: null,
        },
      }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'bot:events',
      JSON.stringify({ type: 'config.updated', guildId: MANAGED }),
    );
  });

  const put = (body: object) =>
    request(app.getHttpServer())
      .put(`${url}/settings`)
      .set('Cookie', cookie)
      .send({ ...settings, ...body });

  it('refuse un salon ou un rôle inconnu du serveur', async () => {
    const channel = await put({ reportFeedChannelId: '400000000000000099' });
    const role = await put({ reportViewerRoleIds: ['600000000000000099'] });

    expect(channel.status).toBe(400);
    expect(channel.body.message).toBe('Salon inconnu sur ce serveur');
    expect(role.body.message).toBe('Rôle inconnu sur ce serveur');
    expect(db.guildConfig.upsert).not.toHaveBeenCalled();
  });

  it('liste les sorties à venir avec leur remplissage', async () => {
    const response = await request(app.getHttpServer()).get(`${url}/events`).set('Cookie', cookie);

    expect(response.body).toEqual([
      {
        id: 12,
        kind: 'RAID',
        activity: 'Dark Hours',
        mode: 'Normal',
        scheduledAt: '2026-11-14T20:00:00.000Z',
        channelId: CHANNEL,
        confirmed: 3,
        capacity: 8,
        reserve: 1,
      },
    ]);
    expect(db.td2Event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { scheduledAt: 'asc' } }),
    );
  });
});

describe('administration', () => {
  const owner = `sid=${OWNER_SESSION_ID}`;

  it('/auth/me dit qui est propriétaire du bot', async () => {
    db.user.findUnique.mockResolvedValue({
      id: '900000000000000001',
      username: 'Djinn',
      avatar: null,
    });

    const response = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', owner);

    expect(response.body).toMatchObject({ id: '900000000000000001', isOwner: true });
  });

  it('refuse toute route d’administration à qui n’est pas propriétaire', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/td2/catalogue')
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Réservé aux propriétaires du bot');
    expect(db.td2Activity.findMany).not.toHaveBeenCalled();
  });

  it('liste le catalogue, compositions complètes et usage de chaque mode', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/td2/catalogue')
      .set('Cookie', owner);

    expect(response.body).toEqual([
      {
        id: 1,
        kind: 'RAID',
        name: 'Dark Hours',
        active: true,
        modes: [
          {
            id: 3,
            name: 'Normal',
            slots: { DPS: 6, HEAL: 1, TANK: 1, HEAL_TANK: 0 },
            eventCount: 2,
          },
        ],
      },
    ]);
  });

  it('refuse un doublon, et un mode qui a déjà servi', async () => {
    db.td2Activity.createMany.mockResolvedValueOnce({ count: 0 });

    const duplicate = await request(app.getHttpServer())
      .post('/api/admin/td2/activities')
      .set('Cookie', owner)
      .send({ kind: 'RAID', name: 'Dark Hours' });
    const inUse = await request(app.getHttpServer())
      .delete('/api/admin/td2/modes/3')
      .set('Cookie', owner);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe('Ce nom est déjà pris');
    expect(inUse.status).toBe(409);
    expect(inUse.body.message).toContain('a servi à 2 sorties');
    expect(db.td2ActivityMode.delete).not.toHaveBeenCalled();
  });

  it('valide une composition avec le schéma partagé', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/admin/td2/modes/3')
      .set('Cookie', owner)
      .send({ name: 'Normal', slots: { DPS: 7, HEAL: 1, TANK: 1, HEAL_TANK: 0 } });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(['slots: Entre 1 et 8 joueurs au total']);
  });

  it('liste les signalements du réseau, sans l’auteur', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/td2/reports?status=CONFIRMED&q=agent')
      .set('Cookie', owner);

    expect(response.body).toEqual({
      reports: [
        {
          id: 7,
          guildId: MANAGED,
          guildName: 'Les Agents',
          playerName: 'Agent47',
          platform: 'PSN',
          reason: 'CHEAT',
          details: 'Tir à travers les murs',
          status: 'CONFIRMED',
          evidenceCount: 2,
          createdAt: '2026-11-10T12:00:00.000Z',
          reviewedAt: '2026-11-10T13:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(response.body)).not.toContain('500000000000000001');
    expect(db.td2Report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED', playerNameLower: { contains: 'agent' } },
      }),
    );
  });

  it('sert une capture comme une image verrouillée', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/td2/reports/7/evidence/1')
      .set('Cookie', owner);

    expect(evidence.getBytes).toHaveBeenCalledWith('td2-reports/b.png');
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.from(response.body as Buffer)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const missing = await request(app.getHttpServer())
      .get('/api/admin/td2/reports/7/evidence/2')
      .set('Cookie', owner);
    expect(missing.status).toBe(404);
  });

  it('supprime un signalement, ses captures, et prévient le bot pour l’embed du staff', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/admin/td2/reports/7')
      .set('Cookie', owner);

    expect(response.status).toBe(204);
    expect(evidence.delete).toHaveBeenCalledWith(['td2-reports/a.png', 'td2-reports/b.png']);
    expect(redis.publish).toHaveBeenCalledWith(
      'bot:events',
      JSON.stringify({
        type: 'td2Report.deleted',
        guildId: MANAGED,
        messageId: '700000000000000007',
      }),
    );
  });
});

/** Les requêtes du forum, sur l'application démarrée par beforeAll. */
function server() {
  return request(app.getHttpServer());
}

describe('forum', () => {
  const member = cookie;
  const moderator = `sid=${MOD_SESSION_ID}`;

  beforeEach(() => {
    store.set(
      `session:${MOD_SESSION_ID}`,
      JSON.stringify({ userId: FORUM_MODERATOR, accessToken: 'tok' }),
    );
    db.user.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => forumUsers[where.id] ?? null,
    );
    forumThread.locked = false;
  });

  it('se lit sans être connecté : catégories, sujets, messages', async () => {
    const categories = await server().get('/api/forum/categories');
    const page = await server().get('/api/forum/categories/entraide?page=abc');
    const missing = await server().get('/api/forum/categories/inconnue');

    expect(categories.body).toEqual([
      {
        id: 2,
        slug: 'entraide',
        name: 'Entraide',
        description: 'Builds et conseils',
        position: 0,
        threadCount: 1,
        lastActivityAt: '2026-11-10T13:00:00.000Z',
      },
    ]);
    expect(page.body).toMatchObject({
      category: { slug: 'entraide' },
      threads: [{ id: 10, title: 'Build tank pour Dark Hours', replyCount: 1 }],
      page: 1,
      pageCount: 1,
      canPost: false,
    });
    expect(missing.status).toBe(404);
  });

  it('rend le Markdown sans laisser passer de HTML, et dit à chacun ce qu’il peut faire', async () => {
    const visitor = await server().get('/api/forum/threads/10');
    const author = await server().get('/api/forum/threads/10').set('Cookie', member);
    const mod = await server().get('/api/forum/threads/10').set('Cookie', moderator);

    expect(visitor.body.posts[0].html).toContain('&lt;script&gt;');
    expect(visitor.body.posts[1].html).toContain('<strong>Foundry</strong>');
    expect(visitor.body).toMatchObject({ canReply: false, canModerate: false });
    // L'auteur modifie son message ; le premier ne se supprime qu'avec le sujet
    expect(author.body.posts.map((post: { canEdit: boolean }) => post.canEdit)).toEqual([
      true,
      false,
    ]);
    expect(author.body.posts[0].canDelete).toBe(false);
    expect(mod.body).toMatchObject({ canReply: true, canModerate: true });
    expect(mod.body.posts[1]).toMatchObject({ canEdit: false, canDelete: true });
  });

  it('écrire demande une connexion, et un message valide', async () => {
    const anonymous = await server()
      .post('/api/forum/threads')
      .send({ categoryId: 2, title: 'Salut', content: 'Hello' });
    const invalid = await server()
      .post('/api/forum/threads')
      .set('Cookie', member)
      .send({ categoryId: 2, title: 'ok', content: 'Hello' });

    expect(anonymous.status).toBe(401);
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toEqual(['title: Un titre de 3 caractères au moins']);
  });

  it('ouvre un sujet, et rattache les images citées', async () => {
    const image = '123e4567-e89b-12d3-a456-426614174000';
    const response = await server()
      .post('/api/forum/threads')
      .set('Cookie', member)
      .send({ categoryId: 2, title: 'Build tank', content: `Voilà ![build](/api/media/${image})` });

    expect(response.body).toEqual({ threadId: 11, postId: 110, page: 1 });
    expect(db.forumAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [image] }, uploaderId: FORUM_MEMBER, postId: null },
      data: { postId: 110 },
    });
  });

  it('un sujet verrouillé refuse les réponses, sauf à la modération', async () => {
    forumThread.locked = true;

    const refused = await server()
      .post('/api/forum/threads/10/posts')
      .set('Cookie', member)
      .send({ content: 'Encore moi' });
    const accepted = await server()
      .post('/api/forum/threads/10/posts')
      .set('Cookie', moderator)
      .send({ content: 'Sujet clos.' });

    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe('Ce sujet est verrouillé : plus de réponse possible.');
    expect(accepted.body).toEqual({ threadId: 10, postId: 102, page: 1 });
  });

  it('on ne modifie que ses messages ; le premier ne se supprime pas seul', async () => {
    const notMine = await server()
      .patch('/api/forum/posts/101')
      .set('Cookie', member)
      .send({ content: 'Corrigé' });
    const first = await server().delete('/api/forum/posts/100').set('Cookie', member);
    const mine = await server()
      .patch('/api/forum/posts/100')
      .set('Cookie', member)
      .send({ content: 'Quel set pour un tank ?' });

    expect(notMine.status).toBe(403);
    expect(first.status).toBe(400);
    expect(first.body.message).toBe('Le premier message ne se supprime qu’avec le sujet.');
    expect(mine.status).toBe(204);
    expect(db.forumPost.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { content: 'Quel set pour un tank ?', editedAt: expect.any(Date) },
    });
  });

  it('la modération épingle, verrouille et supprime ; un membre non', async () => {
    const asMember = await server()
      .patch('/api/forum/threads/10')
      .set('Cookie', member)
      .send({ pinned: true });
    const pinned = await server()
      .patch('/api/forum/threads/10')
      .set('Cookie', moderator)
      .send({ pinned: true });
    const deleted = await server().delete('/api/forum/threads/10').set('Cookie', moderator);

    expect(asMember.status).toBe(403);
    expect(pinned.status).toBe(204);
    expect(db.forumThread.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { pinned: true, updatedAt: forumThread.updatedAt },
    });
    expect(deleted.body).toEqual({ categorySlug: 'entraide' });
    expect(media.delete).toHaveBeenCalledWith(['forum/a.webp']);
  });

  it('limite le débit par compte', async () => {
    store.set(`ratelimit:forum:posts:${FORUM_MEMBER}`, '6');

    const response = await server()
      .post('/api/forum/threads/10/posts')
      .set('Cookie', member)
      .send({ content: 'Un de trop' });

    expect(response.status).toBe(429);
    expect(response.body.message).toBe('Doucement : 6 messages par minute au plus.');
    expect(db.forumPost.create).not.toHaveBeenCalled();
  });
});

describe('images du forum', () => {
  // Un SVG peut contenir du script : refusé, quel que soit le nom du fichier
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';

  beforeEach(() => {
    db.user.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => forumUsers[where.id] ?? null,
    );
  });

  it('ré-encode l’image en WebP, la range dans le bucket, et rend son adresse', async () => {
    const png = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#e85d04' },
    })
      .png()
      .toBuffer();

    const response = await server()
      .post('/api/forum/images')
      .set('Cookie', cookie)
      .attach('image', png, { filename: 'capture.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ width: 2048, height: 1024 });
    expect(response.body.url).toBe(`/api/media/${response.body.id}`);
    const [key, body, type] = media.put.mock.calls[0] as unknown as [string, Buffer, string];
    expect([key, type]).toEqual([`forum/${response.body.id}.webp`, 'image/webp']);
    expect((await sharp(body).metadata()).format).toBe('webp');
  });

  it('refuse ce qui n’est pas une image, même nommé .png, et ce qui est trop lourd', async () => {
    const svg = await server()
      .post('/api/forum/images')
      .set('Cookie', cookie)
      .attach('image', Buffer.from(SVG), 'logo.png');
    const heavy = await server()
      .post('/api/forum/images')
      .set('Cookie', cookie)
      .attach('image', Buffer.alloc(8 * 1024 * 1024 + 1), 'enorme.png');

    expect(svg.status).toBe(400);
    expect(svg.body.message).toBe('Formats acceptés : PNG, JPEG, WebP et GIF.');
    expect(heavy.status).toBe(413);
    expect(heavy.body.message).toBe('Image trop lourde : 8 Mo au plus.');
    expect(media.put).not.toHaveBeenCalled();
  });

  it('sert une image à tout le monde, avec un cache d’un an', async () => {
    const response = await server().get('/api/media/123e4567-e89b-12d3-a456-426614174000');
    const invalid = await server().get('/api/media/pas-un-id');

    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(media.getBytes).toHaveBeenCalledWith('forum/image.webp');
    expect(invalid.status).toBe(404);
  });
});

describe('administration du forum', () => {
  const owner = `sid=${OWNER_SESSION_ID}`;

  it('réservée aux propriétaires du bot', async () => {
    const response = await server().get('/api/admin/forum/categories').set('Cookie', cookie);

    expect(response.status).toBe(403);
  });

  it('refuse un slug déjà pris et une catégorie qui a des sujets', async () => {
    db.forumCategory.createMany.mockResolvedValueOnce({ count: 0 });
    db.forumCategory.findUnique.mockResolvedValueOnce({ _count: { threads: 3 } } as never);

    const duplicate = await server()
      .post('/api/admin/forum/categories')
      .set('Cookie', owner)
      .send({ slug: 'Entraide', name: 'Entraide', description: '', position: 0 });
    const inUse = await server().delete('/api/admin/forum/categories/2').set('Cookie', owner);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe('Ce slug est déjà pris');
    expect(db.forumCategory.createMany).toHaveBeenCalledWith({
      data: [{ slug: 'entraide', name: 'Entraide', description: null, position: 0 }],
      skipDuplicates: true,
    });
    expect(inUse.status).toBe(409);
    expect(inUse.body.message).toBe('La catégorie contient 3 sujets : supprime-les d’abord.');
  });

  it('nomme un modérateur, et refuse un membre qui ne s’est jamais connecté', async () => {
    db.user.findMany.mockResolvedValueOnce([
      { id: FORUM_OTHER, username: 'Faye', avatar: null, role: 'MODERATOR' },
    ]);

    const named = await server()
      .put(`/api/admin/forum/members/${FORUM_OTHER}/role`)
      .set('Cookie', owner)
      .send({ role: 'MODERATOR' });
    db.user.updateMany.mockResolvedValueOnce({ count: 0 });
    const unknown = await server()
      .put('/api/admin/forum/members/700000000000000099/role')
      .set('Cookie', owner)
      .send({ role: 'ADMIN' });

    expect(named.body).toEqual([
      {
        id: FORUM_OTHER,
        username: 'Faye',
        avatarUrl: expect.stringContaining('cdn.discordapp.com'),
        role: 'MODERATOR',
      },
    ]);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: FORUM_OTHER },
      data: { role: 'MODERATOR' },
    });
    expect(unknown.status).toBe(404);
  });
});

describe('santé', () => {
  it('répond ok quand la base et Valkey répondent', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');
    expect(response.body).toEqual({ status: 'ok' });
  });
});
