import type { NextFunction, Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { csrfProtection } from './csrf.js';

const SITE = 'http://localhost:5173';

function run(
  method: string,
  headers: Record<string, string> = {},
  publicUrl = SITE,
  path = '/api/x',
) {
  const request = { method, headers, path } as unknown as Request;
  const json = vi.fn();
  const response = { status: vi.fn(() => ({ json })) } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
  };
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  csrfProtection(publicUrl)(request, response, next);
  return { next, status: response.status, json };
}
const allowed = (r: ReturnType<typeof run>) =>
  r.next.mock.calls.length === 1 && !r.status.mock.calls.length;

describe('csrfProtection', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'laisse passer %s, même venu d’un autre site (sans effet)',
    (method) => {
      expect(
        allowed(run(method, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })),
      ).toBe(true);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('contrôle %s', (method) => {
    expect(allowed(run(method, { origin: SITE }))).toBe(true);
    const refused = run(method, { origin: 'https://evil.example' });
    expect(refused.next).not.toHaveBeenCalled();
    expect(refused.status).toHaveBeenCalledWith(403);
  });

  it('laisse passer un appel sans en-tête de navigateur (curl, tests) : la session est un cookie', () => {
    expect(allowed(run('POST'))).toBe(true);
  });

  it.each([
    ['même origine', 'same-origin', true],
    ['action de l’utilisateur (barre d’adresse)', 'none', true],
    ['un sous-domaine du même site', 'same-site', false],
    ['un autre site', 'cross-site', false],
  ])('Sec-Fetch-Site : %s', (_nom, value, ok) => {
    expect(allowed(run('POST', { 'sec-fetch-site': value }))).toBe(ok);
  });

  it('refuse une origine « null » (page isolée, formulaire d’un document local)', () => {
    expect(allowed(run('POST', { origin: 'null' }))).toBe(false);
  });

  it('refuse quand un des deux en-têtes est étranger, même si l’autre est bon', () => {
    expect(
      allowed(run('POST', { 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' })),
    ).toBe(false);
    expect(allowed(run('POST', { 'sec-fetch-site': 'cross-site', origin: SITE }))).toBe(false);
  });

  it('compare l’origine seule : un chemin ou une barre finale dans PUBLIC_URL n’y change rien', () => {
    expect(allowed(run('POST', { origin: SITE }, `${SITE}/`))).toBe(true);
    expect(allowed(run('POST', { origin: `${SITE}.evil.example` }, SITE))).toBe(false);
  });

  it('laisse une trace d’un refus (pino-http n’est pas encore branché à ce stade), sans donnée personnelle', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    run(
      'POST',
      { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', cookie: 'sid=secret' },
      SITE,
      '/api/guilds/300000000000000001/moderation/members/222222222222222222',
    );

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('https://evil.example');
    expect(logged).toContain('cross-site');
    expect(logged).toContain('POST');
    expect(logged).not.toContain('secret');
    // l'identifiant du membre, dans le chemin de la fiche de modération, est masqué comme dans pino-http
    expect(logged).not.toContain('222222222222222222');
    expect(logged).toContain(':userId');
    warn.mockRestore();
  });

  it('répond un 403 en JSON, comme le reste de l’API', () => {
    const refused = run('POST', { origin: 'https://evil.example' });

    expect(refused.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('origine') }),
    );
  });
});
