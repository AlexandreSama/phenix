import type { Browser } from '@playwright/test';

/** Les comptes des tests : créés en base et connectés par global-setup.ts, sans passer par Discord. */
export const ACCOUNTS = {
  // Doit figurer dans BOT_OWNER_IDS (docker/e2e.env)
  owner: { id: '900000000000000001', username: 'Propriétaire', role: 'MEMBER' },
  member: { id: '900000000000000002', username: 'Agent47', role: 'MEMBER' },
  moderator: { id: '900000000000000003', username: 'Faye', role: 'MODERATOR' },
} as const;

export type AccountName = keyof typeof ACCOUNTS;

/** Un identifiant de session par compte : 43 caractères, comme ceux de l'API. */
export const sessionId = (name: AccountName) => name.padEnd(43, 'x');

/** Une page déjà connectée avec ce compte. */
export async function pageAs(browser: Browser, name: AccountName, baseURL: string) {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([{ name: 'sid', value: sessionId(name), url: baseURL }]);
  return context.newPage();
}
