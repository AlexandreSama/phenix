import type { DashboardModule, PrismaClient } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'guildDelegate'>;

/** Les membres à qui le serveur a ouvert des onglets du tableau de bord, par pseudo. */
export function listGuildDelegates(db: Db, guildId: string) {
  return db.guildDelegate.findMany({ where: { guildId }, orderBy: { username: 'asc' } });
}

/** Les onglets ouverts à ce membre sur ce serveur ; null s'il n'a reçu aucun accès. */
export async function findDelegatedModules(
  db: Db,
  guildId: string,
  userId: string,
): Promise<DashboardModule[] | null> {
  const delegate = await db.guildDelegate.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { modules: true },
  });
  return delegate?.modules ?? null;
}

/** Les serveurs où ce membre a reçu des accès, pour la liste « Mes serveurs » du site. */
export function listDelegationsOf(db: Db, userId: string) {
  return db.guildDelegate.findMany({
    where: { userId, guild: { leftAt: null } },
    select: { guildId: true, modules: true },
  });
}

export interface GuildDelegateInput {
  guildId: string;
  userId: string;
  username: string;
  avatar: string | null;
  /** Les onglets ouverts, au moins un : sans onglet, l'accès se retire */
  modules: DashboardModule[];
  grantedById: string;
}

/** Donne des accès à un membre, ou remplace ceux qu'il avait (pseudo et avatar rafraîchis). */
export function saveGuildDelegate(db: Db, { guildId, userId, ...data }: GuildDelegateInput) {
  const modules = [...new Set(data.modules)];
  return db.guildDelegate.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, ...data, modules },
    update: { ...data, modules },
  });
}

/** Retire tous ses accès à un membre. false : il n'en avait pas. */
export async function deleteGuildDelegate(
  db: Db,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await db.guildDelegate.deleteMany({ where: { guildId, userId } });
  return count > 0;
}
