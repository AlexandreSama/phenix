import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Le .env est à la racine du monorepo ; absent en CI et dans Docker, ce n'est pas une erreur.
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // process.env plutôt que env() : `prisma generate` doit marcher sans base (CI, build Docker)
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
