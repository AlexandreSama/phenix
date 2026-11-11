import 'reflect-metadata';
import { DiscordAPIError } from '@discordjs/rest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@phenix/database';
import { Redis } from 'ioredis';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { EVIDENCE, GIVEAWAY_QUEUE, MEDIA, TRANSCRIPTS } from './core/tokens.js';
import { DiscordService } from './discord/discord.service.js';
import type { Env } from './env.js';

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
  APP_VERSION: 'test',
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
/** Un membre de MANAGED sans « Gérer le serveur », à qui l'onglet TD2 a été ouvert. */
const DELEGATE = '700000000000000009';
const DELEGATE_SESSION_ID = 'd'.repeat(43);

/** Valkey en mémoire : sessions, cache et publication. */
const store = new Map<string, string>();
const redis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => void store.set(key, value)),
  del: vi.fn(async (key: string) => Number(store.delete(key))),
  publish: vi.fn(async (_channel: string, _message: string) => 1),
  // Les limites de débit du forum : un compteur par clé
  incr: vi.fn(async (key: string) => {
    const count = Number(store.get(key) ?? 0) + 1;
    store.set(key, String(count));
    return count;
  }),
  expire: vi.fn(async () => 1),
  ping: vi.fn(async () => 'PONG'),
  quit: vi.fn(async () => 'OK'),
  // La mémoire de Valkey, pour la page Métriques
  info: vi.fn(async (_section: string) => '# Memory\r\nused_memory:2097152\r\nmaxmemory:0\r\n'),
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
  td2PublicListing: false,
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
/** Une sortie Dark Hours samedi soir : 3 confirmés sur 8, 1 en réserve. */
const td2Event = {
  id: 12,
  scheduledAt: new Date('2026-11-14T20:00:00Z'),
  channelId: CHANNEL,
  missionName: null as string | null,
  difficulty: null as string | null,
  directives: [] as string[],
  mode: { name: 'Normal', activity: { kind: 'RAID', name: 'Dark Hours' } } as object | null,
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
/** Les directives des missions : une active, une retirée. */
const td2Directives = [
  { id: 1, name: 'Brouillard de guerre', description: 'Mini-carte vide.', active: true },
  { id: 2, name: 'Ancienne', description: null, active: false },
];
/** L'accès de DELEGATE sur MANAGED, tel que la base le garde. */
const delegateRow = {
  guildId: MANAGED,
  userId: DELEGATE,
  username: 'faye',
  avatar: null,
  modules: ['TD2'],
  grantedById: '1',
  createdAt: new Date('2026-11-10T12:00:00Z'),
  updatedAt: new Date('2026-11-10T12:00:00Z'),
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
/** Les réponses des requêtes des métriques, reconnues à un bout de leur SQL. */
const metricsRows = {
  totals: { count: 42, errors: 2, guilds: 3 },
  ranking: [
    { command: 'td2 mission', count: 30, errors: 1, avgDurationMs: 120 },
    { command: 'ping', count: 12, errors: 1, avgDurationMs: 15 },
  ],
  daily: [{ day: '2026-11-11', count: 42, errors: 2 }],
  guilds: [
    {
      id: MANAGED,
      name: 'Les Agents',
      icon: 'abc',
      count: 40,
      topCommand: 'td2 mission',
      lastActiveAt: '2026-11-11T09:00:00.000Z',
    },
    {
      id: '',
      name: null,
      icon: null,
      count: 2,
      topCommand: 'ping',
      lastActiveAt: '2026-11-11T08:00:00.000Z',
    },
  ],
  storage: [
    { name: 'garage.media.bytes', value: 4096, takenAt: '2026-11-11T09:05:00.000Z' },
    { name: 'garage.media.objects', value: 2, takenAt: '2026-11-11T09:05:00.000Z' },
    { name: 'postgres.bytes', value: 9000, takenAt: '2026-11-11T09:05:00.000Z' },
  ],
  series: [
    { name: 'bot.cpu', at: '2026-11-11T09:00:00.000Z', value: 3.5 },
    { name: 'bot.cpu', at: '2026-11-11T09:05:00.000Z', value: 4.5 },
  ],
};

function metricsSql(sql: string): unknown[] {
  if (sql.includes('pg_database_size')) return [{ bytes: 10_485_760 }];
  if (sql.includes('pg_statio_user_tables')) return [{ name: 'ForumPost', bytes: 4_194_304 }];
  if (sql.includes('NOT LIKE')) return metricsRows.storage;
  if (sql.includes('count(DISTINCT')) return [metricsRows.totals];
  if (sql.includes('DISTINCT ON')) return metricsRows.guilds;
  if (sql.includes('avgDurationMs')) return metricsRows.ranking;
  if (sql.includes("'YYYY-MM-DD'")) return metricsRows.daily;
  if (sql.includes('date_bin')) return metricsRows.series;
  return [1];
}

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
  td2Event: { findMany: vi.fn(async () => [td2Event] as object[]), count: vi.fn(async () => 2) },
  td2Directive: {
    findMany: vi.fn(async () => td2Directives),
    findUnique: vi.fn(async () => td2Directives[1] as object | null),
    findUniqueOrThrow: vi.fn(async () => td2Directives[0]),
    count: vi.fn(async () => 1),
    createMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => td2Directives[0]),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  guildDelegate: {
    // Les accès d'un membre (listDelegationsOf) ou ceux d'un serveur (listGuildDelegates)
    findMany: vi.fn(async ({ where }: { where: { userId?: string; guildId?: string } }) =>
      where.userId === DELEGATE || where.guildId === MANAGED ? [delegateRow] : [],
    ),
    upsert: vi.fn(async ({ create }: { create: object }) => ({ ...delegateRow, ...create })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
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
    // findPublicTd2Guild : un serveur qui montre ses sorties, et son salon TD2
    findFirst: vi.fn(
      async () =>
        ({ id: MANAGED, name: 'Les Agents', config: { td2ChannelId: CHANNEL } }) as object | null,
    ),
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
  // Le SQL écrit à la main : celui des métriques, aiguillé sur son texte (testé à part, sur un
  // vrai Postgres, dans packages/database) ; SELECT 1 pour /api/health
  $queryRaw: vi.fn(async (strings: TemplateStringsArray) => metricsSql(strings.join('?'))),
  $disconnect: vi.fn(),
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
  searchGuildMembers: vi.fn(async () => [
    { nick: null, user: { id: DELEGATE, username: 'faye', global_name: 'Faye', avatar: null } },
    { nick: null, user: { id: '700000000000000010', username: 'fbot', avatar: null, bot: true } },
  ]),
  getGuildMember: vi.fn(
    async () =>
      ({ user: { id: DELEGATE, username: 'faye', avatar: 'f00d' } }) as {
        user: { id: string; username: string; avatar: string | null; bot?: boolean };
      } | null,
  ),
  createInvite: vi.fn(async () => 'agents'),
};

/** L'erreur que Discord renvoie quand le bot n'a pas une permission. */
const missingPermissions = () =>
  new DiscordAPIError(
    { code: 50013, message: 'Missing Permissions' },
    50013,
    403,
    'POST',
    '/channels/x/invites',
    { body: undefined, files: undefined },
  );

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
    .overrideProvider(TRANSCRIPTS)
    .useValue(transcripts)
    .overrideProvider(EVIDENCE)
    .useValue(evidence)
    .overrideProvider(MEDIA)
    .useValue(media)
    .overrideProvider(GIVEAWAY_QUEUE)
    .useValue(giveawayQueue)
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
  store.set(
    `session:${DELEGATE_SESSION_ID}`,
    JSON.stringify({ userId: DELEGATE, accessToken: 'tok-faye' }),
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
    publicListing: false,
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
      publicListing: false,
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
          td2PublicListing: false,
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
        difficulty: null,
        directives: [],
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

  it('une mission : son nom, sa difficulté et ses directives, sans mode', async () => {
    db.td2Event.findMany.mockResolvedValueOnce([
      {
        ...td2Event,
        mode: null,
        missionName: 'Capitole',
        difficulty: 'HEROIC',
        directives: ['Brouillard de guerre'],
        slots: [{ count: 4 }],
      },
    ]);

    const response = await request(app.getHttpServer()).get(`${url}/events`).set('Cookie', cookie);

    expect(response.body[0]).toMatchObject({
      kind: 'MISSION',
      activity: 'Capitole',
      mode: null,
      difficulty: 'HEROIC',
      directives: ['Brouillard de guerre'],
      capacity: 4,
    });
  });

  it('montrer le serveur sur la page publique demande le salon des sorties', async () => {
    const response = await put({ channelId: null, publicListing: true });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual([
      'publicListing: Choisis d’abord le salon des sorties : l’invitation y mène',
    ]);
  });

  it('à l’activation, crée l’invitation tout de suite et rafraîchit la page publique', async () => {
    store.set('td2-public-events', '[]');

    const response = await put({ publicListing: true });

    expect(response.status).toBe(200);
    expect(response.body.publicListing).toBe(true);
    expect(discord.createInvite).toHaveBeenCalledWith(CHANNEL, 7 * 24 * 3600);
    expect(JSON.parse(store.get(`td2-invite:${MANAGED}`) ?? '{}')).toEqual({
      channelId: CHANNEL,
      code: 'agents',
    });
    expect(store.has('td2-public-events')).toBe(false);
  });

  it('sans la permission « Créer une invitation », l’admin l’apprend et rien n’est enregistré', async () => {
    discord.createInvite.mockRejectedValueOnce(missingPermissions());

    const response = await put({ publicListing: true });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('« Créer une invitation »');
    expect(db.guildConfig.upsert).toHaveBeenCalledTimes(1); // la lecture, pas l'écriture
  });
});

describe('page publique des sorties', () => {
  const publicEvent = {
    ...td2Event,
    guild: { id: MANAGED, name: 'Les Agents', icon: 'abc' },
  };

  it('se lit sans connexion, sans les salons, et sert le cache ensuite', async () => {
    db.td2Event.findMany.mockResolvedValueOnce([publicEvent]);

    const first = await request(app.getHttpServer()).get('/api/td2/public/events');
    const second = await request(app.getHttpServer()).get('/api/td2/public/events');

    expect(first.status).toBe(200);
    expect(first.body).toEqual([
      {
        id: 12,
        kind: 'RAID',
        activity: 'Dark Hours',
        mode: 'Normal',
        difficulty: null,
        directives: [],
        scheduledAt: '2026-11-14T20:00:00.000Z',
        confirmed: 3,
        capacity: 8,
        reserve: 1,
        guild: {
          id: MANAGED,
          name: 'Les Agents',
          iconUrl: `https://cdn.discordapp.com/icons/${MANAGED}/abc.png?size=128`,
        },
      },
    ]);
    expect(second.body).toEqual(first.body);
    expect(db.td2Event.findMany).toHaveBeenCalledTimes(1);
  });

  const join = (guildId = MANAGED) =>
    request(app.getHttpServer()).get(`/api/td2/public/guilds/${guildId}/join`);

  it('« Rejoindre » redirige vers l’invitation, créée une fois puis reprise du cache', async () => {
    const first = await join();
    const second = await join();

    expect(first.status).toBe(302);
    expect(first.headers.location).toBe('https://discord.gg/agents');
    expect(second.headers.location).toBe('https://discord.gg/agents');
    expect(discord.createInvite).toHaveBeenCalledTimes(1);
  });

  it('serveur caché ou Discord qui refuse : retour à la page, sans réessayer à chaque clic', async () => {
    db.guild.findFirst.mockResolvedValueOnce(null);
    const hidden = await join();
    expect(hidden.headers.location).toBe('http://localhost:5173/sorties?invitation=indisponible');
    expect(discord.createInvite).not.toHaveBeenCalled();

    discord.createInvite.mockRejectedValueOnce(missingPermissions());
    const refused = await join();
    const again = await join();
    expect(refused.headers.location).toBe('http://localhost:5173/sorties?invitation=indisponible');
    expect(again.headers.location).toBe('http://localhost:5173/sorties?invitation=indisponible');
    expect(discord.createInvite).toHaveBeenCalledTimes(1);

    const garbage = await join('pas-un-id');
    expect(garbage.headers.location).toBe('http://localhost:5173/sorties?invitation=indisponible');
  });
});

const faye = `sid=${DELEGATE_SESSION_ID}`;
/** Une page d'un serveur, demandée par Faye, la déléguée. */
const asFaye = (path: string) =>
  request(app.getHttpServer()).get(`/api/guilds/${MANAGED}${path}`).set('Cookie', faye);

describe('accès délégués', () => {
  /** Faye est sur MANAGED sans « Gérer le serveur » ; elle n'est pas sur NOT_MANAGED. */
  const fayeGuilds = () =>
    discord.getCurrentUserGuilds.mockResolvedValueOnce([
      { id: MANAGED, name: 'Les Agents', icon: null, owner: false, permissions: '0' },
    ]);

  it('un délégué voit le serveur avec ses seuls onglets', async () => {
    fayeGuilds();

    const response = await request(app.getHttpServer()).get('/api/guilds').set('Cookie', faye);

    expect(response.body).toEqual([
      {
        id: MANAGED,
        name: 'Les Agents',
        iconUrl: null,
        botPresent: true,
        access: 'delegate',
        modules: ['TD2'],
      },
    ]);
  });

  it('un administrateur a tous les onglets', async () => {
    const response = await request(app.getHttpServer()).get('/api/guilds').set('Cookie', cookie);

    expect(response.body[0]).toMatchObject({
      id: MANAGED,
      access: 'admin',
      modules: ['GENERAL', 'LEVELING', 'ROLES', 'TICKETS', 'GIVEAWAYS', 'TD2'],
    });
  });

  it('il entre dans l’onglet reçu et lit salons et rôles, rien d’autre', async () => {
    fayeGuilds();

    expect((await asFaye('/td2/settings')).status).toBe(200);
    expect((await asFaye('/channels')).status).toBe(200);
    const general = await asFaye('/config');
    expect(general.status).toBe(403);
    expect(general.body.message).toBe('Cet onglet ne t’a pas été ouvert sur ce serveur');
    const delegates = await asFaye('/delegates');
    expect(delegates.status).toBe(403);
    expect(delegates.body.message).toBe('Réservé aux administrateurs du serveur');
  });

  it('un accès ne vaut plus rien hors du serveur', async () => {
    discord.getCurrentUserGuilds.mockResolvedValueOnce([]);

    const list = await request(app.getHttpServer()).get('/api/guilds').set('Cookie', faye);
    const td2 = await request(app.getHttpServer())
      .get(`/api/guilds/${MANAGED}/td2/settings`)
      .set('Cookie', faye);

    expect(list.body).toEqual([]);
    expect(td2.status).toBe(403);
  });

  const url = `/api/guilds/${MANAGED}`;

  it('l’administrateur liste les accès donnés', async () => {
    const response = await request(app.getHttpServer())
      .get(`${url}/delegates`)
      .set('Cookie', cookie);

    expect(response.body).toEqual([
      {
        userId: DELEGATE,
        username: 'faye',
        avatarUrl: expect.stringMatching(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\//),
        modules: ['TD2'],
        grantedById: '1',
        updatedAt: '2026-11-10T12:00:00.000Z',
      },
    ]);
  });

  it('cherche un membre par pseudo, sans les bots, et garde la réponse 30 s', async () => {
    const search = () =>
      request(app.getHttpServer()).get(`${url}/members?q=Fa`).set('Cookie', cookie);

    const first = await search();
    await search();
    const short = await request(app.getHttpServer())
      .get(`${url}/members?q=f`)
      .set('Cookie', cookie);

    expect(first.body).toEqual([
      {
        id: DELEGATE,
        username: 'faye',
        displayName: 'Faye',
        avatarUrl: expect.any(String),
      },
    ]);
    expect(discord.searchGuildMembers).toHaveBeenCalledTimes(1);
    expect(discord.searchGuildMembers).toHaveBeenCalledWith(MANAGED, 'Fa', 10);
    expect(short.status).toBe(400);
  });

  const grant = (userId: string, modules: string[]) =>
    request(app.getHttpServer())
      .put(`${url}/delegates/${userId}`)
      .set('Cookie', cookie)
      .send({ modules });

  it('ouvre des onglets à un membre, relu chez Discord', async () => {
    const response = await grant(DELEGATE, ['TICKETS', 'TD2', 'TICKETS']);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: DELEGATE, modules: ['TICKETS', 'TD2'] });
    expect(discord.getGuildMember).toHaveBeenCalledWith(MANAGED, DELEGATE);
    expect(db.guildDelegate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          guildId: MANAGED,
          userId: DELEGATE,
          username: 'faye',
          avatar: 'f00d',
          modules: ['TICKETS', 'TD2'],
          grantedById: '1',
        }),
      }),
    );
  });

  it('refuse aucun onglet, un ID illisible, soi-même, un absent du serveur, un bot', async () => {
    const none = await grant(DELEGATE, []);
    const garbage = await grant('abc', ['TD2']);
    // Le propriétaire du bot gère aussi MANAGED : il ne se délègue rien
    const self = await request(app.getHttpServer())
      .put(`${url}/delegates/900000000000000001`)
      .set('Cookie', `sid=${OWNER_SESSION_ID}`)
      .send({ modules: ['TD2'] });
    discord.getGuildMember.mockResolvedValueOnce(null);
    const absent = await grant(DELEGATE, ['TD2']);
    discord.getGuildMember.mockResolvedValueOnce({
      user: { id: DELEGATE, username: 'robot', avatar: null, bot: true },
    });
    const bot = await grant(DELEGATE, ['TD2']);

    expect(none.body.message).toEqual(['modules: Coche au moins un onglet']);
    expect(garbage.status).toBe(404);
    expect(self.status).toBe(400);
    expect(self.body.message).toBe('Tu as déjà accès à tous les onglets de ce serveur');
    expect(absent.status).toBe(404);
    expect(absent.body.message).toBe("Ce membre n'est pas sur le serveur");
    expect(bot.status).toBe(400);
    expect(db.guildDelegate.upsert).not.toHaveBeenCalled();
  });

  it('retire un accès ; un second retrait répond 404', async () => {
    const removed = await request(app.getHttpServer())
      .delete(`${url}/delegates/${DELEGATE}`)
      .set('Cookie', cookie);
    db.guildDelegate.deleteMany.mockResolvedValueOnce({ count: 0 });
    const again = await request(app.getHttpServer())
      .delete(`${url}/delegates/${DELEGATE}`)
      .set('Cookie', cookie);

    expect(removed.status).toBe(204);
    expect(again.status).toBe(404);
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

  it('gère les directives des missions, 25 actives au plus', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/admin/td2/directives')
      .set('Cookie', owner);
    const created = await request(app.getHttpServer())
      .post('/api/admin/td2/directives')
      .set('Cookie', owner)
      .send({ name: '  Chrono ', description: '' });
    db.td2Directive.count.mockResolvedValueOnce(25);
    const full = await request(app.getHttpServer())
      .post('/api/admin/td2/directives')
      .set('Cookie', owner)
      .send({ name: 'Une de trop', description: null });
    db.td2Directive.deleteMany.mockResolvedValueOnce({ count: 0 });
    const missing = await request(app.getHttpServer())
      .delete('/api/admin/td2/directives/99')
      .set('Cookie', owner);

    expect(list.body).toEqual(td2Directives);
    expect(created.status).toBe(201);
    expect(db.td2Directive.createMany).toHaveBeenCalledWith({
      data: [{ name: 'Chrono', description: null }],
      skipDuplicates: true,
    });
    expect(full.status).toBe(409);
    expect(full.body.message).toContain('25 directives actives au plus');
    expect(missing.status).toBe(404);
  });

  it('réactiver une directive compte aussi dans la limite', async () => {
    db.td2Directive.count.mockResolvedValueOnce(25);

    const response = await request(app.getHttpServer())
      .patch('/api/admin/td2/directives/2')
      .set('Cookie', owner)
      .send({ active: true });

    expect(response.status).toBe(409);
    expect(db.td2Directive.update).not.toHaveBeenCalled();
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

describe('métriques', () => {
  const owner = `sid=${OWNER_SESSION_ID}`;
  const botBeat = {
    at: '2026-11-11T09:00:00.000Z',
    cpu: 3.2,
    memory: 180_000_000,
    memoryLimit: 536_870_912,
    uptime: 7200,
    version: 'abc123',
    eventLoopDelayMs: 1.1,
    guilds: 12,
    ping: 42,
  };

  it('refuse les métriques à qui n’est pas propriétaire, et sans session', async () => {
    for (const path of ['overview', 'commands', 'guilds', 'series?names=bot.cpu']) {
      const member = await server().get(`/api/admin/metrics/${path}`).set('Cookie', cookie);
      const anonymous = await server().get(`/api/admin/metrics/${path}`);
      expect([member.status, anonymous.status]).toEqual([403, 401]);
    }
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('overview : le bot en ligne, l’API hors ligne sans battement, le stockage et les totaux', async () => {
    store.set('metrics:live:bot', JSON.stringify(botBeat));

    const response = await server().get('/api/admin/metrics/overview').set('Cookie', owner);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      services: { bot: { online: true, heartbeat: botBeat }, api: { online: false } },
      commands: { '24h': metricsRows.totals, '7d': metricsRows.totals, '30d': metricsRows.totals },
      storage: {
        takenAt: '2026-11-11T09:05:00.000Z',
        postgres: { bytes: 10_485_760, tables: [{ name: 'ForumPost', bytes: 4_194_304 }] },
        valkey: { bytes: 2_097_152, maxBytes: null },
        garage: [{ name: 'media', bytes: 4096, objects: 2 }],
      },
    });
    expect(redis.info).toHaveBeenCalledWith('memory');
  });

  it('overview : un battement illisible compte comme hors ligne, Valkey muet ne casse rien', async () => {
    store.set('metrics:live:bot', JSON.stringify({ ...botBeat, cpu: 'beaucoup' }));
    store.set('metrics:live:api', 'pas du JSON');
    redis.info.mockRejectedValueOnce(new Error('Valkey absent'));

    const response = await server().get('/api/admin/metrics/overview').set('Cookie', owner);

    expect(response.body.services).toEqual({ bot: { online: false }, api: { online: false } });
    expect(response.body.storage.valkey).toEqual({ bytes: null, maxBytes: null });
  });

  it('garde chaque réponse 30 secondes dans le cache', async () => {
    const first = await server().get('/api/admin/metrics/overview').set('Cookie', owner);
    const calls = db.$queryRaw.mock.calls.length;
    // Le bot passe en ligne entre-temps : le cache sert encore l'ancienne réponse
    store.set('metrics:live:bot', JSON.stringify(botBeat));
    const second = await server().get('/api/admin/metrics/overview').set('Cookie', owner);

    expect(second.body).toEqual(first.body);
    expect(db.$queryRaw.mock.calls.length).toBe(calls);
    expect(redis.set).toHaveBeenCalledWith('metrics:cache:overview', expect.any(String), 'EX', 30);
  });

  it('commands : le classement et la courbe par jour de la plage demandée', async () => {
    const response = await server()
      .get('/api/admin/metrics/commands?range=7d')
      .set('Cookie', owner);

    expect(response.body).toEqual({
      range: '7d',
      commands: metricsRows.ranking,
      daily: metricsRows.daily,
    });
    expect(store.has('metrics:cache:commands:7d')).toBe(true);
  });

  it('guilds : les serveurs avec leur icône, 24 h par défaut', async () => {
    const response = await server().get('/api/admin/metrics/guilds').set('Cookie', owner);

    expect(response.body).toEqual({
      range: '24h',
      guilds: [
        {
          id: MANAGED,
          name: 'Les Agents',
          iconUrl: `https://cdn.discordapp.com/icons/${MANAGED}/abc.png?size=128`,
          count: 40,
          topCommand: 'td2 mission',
          lastActiveAt: '2026-11-11T09:00:00.000Z',
        },
        {
          id: '',
          name: null,
          iconUrl: null,
          count: 2,
          topCommand: 'ping',
          lastActiveAt: '2026-11-11T08:00:00.000Z',
        },
      ],
    });
  });

  it('series : une courbe par nom demandé, vide sans relevé, au pas de la plage', async () => {
    const response = await server()
      .get('/api/admin/metrics/series?names=bot.cpu,api.cpu&range=30d')
      .set('Cookie', owner);

    expect(response.body).toEqual({
      range: '30d',
      binMinutes: 240,
      series: [
        {
          name: 'bot.cpu',
          points: [
            { at: '2026-11-11T09:00:00.000Z', value: 3.5 },
            { at: '2026-11-11T09:05:00.000Z', value: 4.5 },
          ],
        },
        { name: 'api.cpu', points: [] },
      ],
    });
  });

  it('refuse une plage ou un relevé inconnu', async () => {
    const badRange = await server()
      .get('/api/admin/metrics/commands?range=1y')
      .set('Cookie', owner);
    const badName = await server()
      .get('/api/admin/metrics/series?names=bot.disque')
      .set('Cookie', owner);
    const noName = await server().get('/api/admin/metrics/series').set('Cookie', owner);

    expect([badRange.status, badName.status, noName.status]).toEqual([400, 400, 400]);
  });
});

describe('santé', () => {
  it('répond ok quand la base et Valkey répondent', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('le bot : ok tant que son battement de cœur est là, 503 sinon', async () => {
    const heartbeat = {
      at: '2026-11-11T09:00:00.000Z',
      cpu: 3,
      memory: 1000,
      memoryLimit: null,
      uptime: 60,
      version: 'abc123',
      eventLoopDelayMs: 1,
      guilds: 12,
      ping: 42,
    };
    store.set('metrics:live:bot', JSON.stringify(heartbeat));
    const alive = await server().get('/api/health/bot');
    store.set('metrics:live:bot', 'pas du JSON');
    const corrupt = await server().get('/api/health/bot');
    store.delete('metrics:live:bot');
    const absent = await server().get('/api/health/bot');

    // La réponse d'avant la phase 11, pour les surveillances externes
    expect(alive.body).toEqual({ status: 'ok', at: heartbeat.at, guilds: 12, ping: 42 });
    expect([corrupt.status, absent.status]).toEqual([503, 503]);
    expect(absent.body.message).toBe('Le bot ne donne plus signe de vie');
  });
});
