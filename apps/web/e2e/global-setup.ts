import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS, sessionId } from './accounts';

/** La racine du monorepo, où docker compose trouve ses fichiers. */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const compose =
  process.env.E2E_COMPOSE ?? 'docker compose -f docker-compose.yml -f docker-compose.e2e.yml';

const run = (command: string, input: string) =>
  execSync(`${compose} ${command}`, { cwd: root, input, stdio: ['pipe', 'ignore', 'inherit'] });

/**
 * Crée les comptes des tests et leurs sessions, comme le ferait une connexion Discord :
 * une ligne User dans Postgres, une clé session:<id> dans Valkey.
 */
export default function globalSetup(): void {
  const users = Object.values(ACCOUNTS)
    .map(({ id, username, role }) => `('${id}', '${username}', '${role}')`)
    .join(', ');
  run(
    `exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`,
    `INSERT INTO "User" (id, username, role) VALUES ${users}
     ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;`,
  );

  const sessions = Object.entries(ACCOUNTS)
    .map(([name, { id }]) => {
      const session = JSON.stringify({ userId: id, accessToken: 'jeton-de-test' });
      return `SET session:${sessionId(name as keyof typeof ACCOUNTS)} '${session}' EX 3600`;
    })
    .join('\n');
  run('exec -T redis valkey-cli', sessions);
}
