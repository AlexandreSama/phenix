import type { PrismaClient, Td2Platform, Td2Profile } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'td2Profile'>;

/** Le compte TD2 d'un membre, le même sur tous les serveurs ; null s'il n'en a pas lié. */
export function findTd2Profile(db: Db, userId: string): Promise<Td2Profile | null> {
  return db.td2Profile.findUnique({ where: { userId } });
}

export interface Td2ProfileInput {
  userId: string;
  platform: Td2Platform;
  playerName: string;
}

/** Lie un compte, ou remplace celui déjà lié : un membre n'a qu'un compte TD2. */
export function linkTd2Profile(
  db: Db,
  { userId, platform, playerName }: Td2ProfileInput,
  now = new Date(),
): Promise<Td2Profile> {
  const data = { platform, playerName: playerName.trim(), linkedAt: now };
  return db.td2Profile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

/** Délie le compte du membre ; false s'il n'en avait pas. */
export async function unlinkTd2Profile(db: Db, userId: string): Promise<boolean> {
  const { count } = await db.td2Profile.deleteMany({ where: { userId } });
  return count > 0;
}
