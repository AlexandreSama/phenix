import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

/** Crée un client Prisma sur une base donnée (utile pour les tests). */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Le client partagé par l'API et le bot, sur DATABASE_URL. */
export const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
