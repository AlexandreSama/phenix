import { config } from 'dotenv';

config({ path: '../../.env', quiet: true });

// Import dynamique : le client doit être créé après le chargement du .env.
const { prisma } = await import('../src/client.js');
const { seedTd2Catalogue } = await import('../src/td2-catalogue.js');

try {
  await seedTd2Catalogue(prisma);
  console.log('Seed terminé : catalogue TD2 à jour.');
} finally {
  await prisma.$disconnect();
}
