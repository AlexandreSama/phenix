import { expect, test } from '@playwright/test';
import { pageAs } from './accounts';

/** Une image PNG de 2 × 2 pixels : de quoi passer par sharp, puis par Garage. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWN4EcvyIpaFAUIBACeaBSV3HZ/ZAAAAAElFTkSuQmCC',
  'base64',
);

// Les tests se suivent : chacun part de ce que le précédent a créé
test.describe.configure({ mode: 'serial' });

test('l’API répond derrière le reverse proxy', async ({ request }) => {
  const health = await request.get('/api/health');

  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ status: 'ok' });
});

test('un visiteur arrive sur le site, et une adresse inconnue affiche la page introuvable', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Un seul bot/, level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inviter le bot' }).first()).toHaveAttribute(
    'href',
    '/api/invite',
  );

  await page.goto('/une/adresse/inconnue');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
});

test('le propriétaire du bot crée une catégorie du forum', async ({ browser, baseURL }) => {
  const owner = await pageAs(browser, 'owner', baseURL!);
  await owner.goto('/admin/forum');

  const form = owner.getByRole('form', { name: 'Nouvelle catégorie' });
  await form.getByLabel('Nom').fill('Entraide');
  await form.getByLabel('Adresse').fill('entraide');
  await form.getByRole('button', { name: 'Ajouter la catégorie' }).click();

  await expect(owner.getByRole('form', { name: 'Catégorie Entraide' })).toBeVisible();
});

test('un membre ouvre un sujet avec une image, rangée dans Garage', async ({
  browser,
  baseURL,
}) => {
  const member = await pageAs(browser, 'member', baseURL!);
  await member.goto('/forum/entraide');
  await member.getByRole('link', { name: 'Nouveau sujet' }).click();

  await member.getByLabel('Titre').fill('Build tank pour Dark Hours');
  await member.getByLabel('Message').fill('Quel set pour le **tank** ?');
  await member
    .getByLabel('Image à ajouter')
    .setInputFiles({ name: 'build.png', mimeType: 'image/png', buffer: PNG });
  await expect(member.getByLabel('Message')).toHaveValue(/\/api\/media\//);
  await member.getByRole('button', { name: 'Publier le sujet' }).click();

  await expect(member.getByRole('heading', { name: 'Build tank pour Dark Hours' })).toBeVisible();
  const image = member.getByRole('article').first().locator('.forum-content img');
  // L'image a fait l'aller-retour : envoyée, ré-encodée, rangée dans le bucket, servie par l'API
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(2);
});

test('la modération verrouille le sujet : le membre ne peut plus répondre', async ({
  browser,
  baseURL,
}) => {
  const moderator = await pageAs(browser, 'moderator', baseURL!);
  await moderator.goto('/forum/entraide');
  await moderator.getByRole('link', { name: 'Build tank pour Dark Hours' }).click();
  const bar = moderator.getByRole('group', { name: 'Modération' });
  await bar.getByRole('button', { name: 'Verrouiller' }).click();
  await expect(bar.getByRole('button', { name: 'Déverrouiller' })).toBeVisible();

  const member = await pageAs(browser, 'member', baseURL!);
  await member.goto(moderator.url());
  await expect(
    member.getByText('Ce sujet est verrouillé : plus de réponse possible.'),
  ).toBeVisible();
  await expect(member.getByLabel('Ta réponse')).toHaveCount(0);
});
