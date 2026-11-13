import type { NextFunction, Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { isJsonRequest, JSON_ONLY_MESSAGE, jsonOnly } from './json-only.js';

const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'];
const IMAGES = '/api/forum/images';
const MULTIPART = 'multipart/form-data; boundary=----x';

function run(method: string, headers: Record<string, string> = {}, path = '/api/x') {
  const request = { method, headers, path } as unknown as Request;
  const json = vi.fn();
  const response = { status: vi.fn(() => ({ json })) } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
  };
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  jsonOnly()(request, response, next);
  return { next, status: response.status, json };
}
const allowed = (r: ReturnType<typeof run>) =>
  r.next.mock.calls.length === 1 && !r.status.mock.calls.length;
const refused = (r: ReturnType<typeof run>) =>
  !r.next.mock.calls.length && r.status.mock.calls[0]?.[0] === 415;

describe('isJsonRequest', () => {
  it.each([
    ['application/json', true],
    ['application/json; charset=utf-8', true],
    ['Application/JSON', true],
    ['application/json ; charset=UTF-8', true],
    ['application/vnd.api+json', false],
    ['application/ld+json', false],
    ['text/json', false],
    ['application/x-www-form-urlencoded', false],
    ['text/plain', false],
    ['multipart/form-data; boundary=x', false],
    ['application/json, text/plain', false],
    ['', false],
  ])('« %s » → %s', (type, expected) => {
    expect(isJsonRequest({ headers: { 'content-type': type } })).toBe(expected);
  });

  it('refuse une requête sans Content-Type', () => {
    expect(isJsonRequest({ headers: {} })).toBe(false);
  });
});

describe('jsonOnly', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('ne contrôle jamais %s, même en formulaire', (method) => {
    expect(
      allowed(
        run(method, {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': '3',
        }),
      ),
    ).toBe(true);
  });

  describe.each(WRITES)('%s', (method) => {
    it('laisse passer sans Content-Type ni corps (curl, déconnexion)', () => {
      expect(allowed(run(method))).toBe(true);
      expect(allowed(run(method, { 'content-length': '0' }))).toBe(true);
    });

    it.each([
      'application/json',
      'application/json; charset=utf-8',
      'Application/JSON',
      'APPLICATION/JSON;CHARSET=UTF-8',
    ])('laisse passer « %s », avec ou sans corps', (type) => {
      expect(allowed(run(method, { 'content-type': type, 'content-length': '2' }))).toBe(true);
      expect(allowed(run(method, { 'content-type': type }))).toBe(true);
    });

    it.each([
      ['un formulaire HTML', 'application/x-www-form-urlencoded', '9'],
      ['un formulaire HTML sans champ', 'application/x-www-form-urlencoded', '0'],
      ['du texte brut', 'text/plain', '5'],
      ['du texte brut vide', 'text/plain;charset=UTF-8', '0'],
      ['du multipart hors liste blanche', MULTIPART, '20'],
      ['une variante +json', 'application/vnd.api+json', '2'],
      ['une autre variante +json', 'application/merge-patch+json', '2'],
    ])('refuse %s (415)', (_nom, type, length) => {
      expect(refused(run(method, { 'content-type': type, 'content-length': length }))).toBe(true);
    });

    it('refuse un corps sans Content-Type (Content-Length ou Transfer-Encoding)', () => {
      expect(refused(run(method, { 'content-length': '5' }))).toBe(true);
      expect(refused(run(method, { 'transfer-encoding': 'chunked' }))).toBe(true);
    });
  });

  describe('liste blanche : envoi d’image du forum en multipart', () => {
    it.each([IMAGES, `${IMAGES}/`, '/api/FORUM/images', '/API/Forum/Images/'])(
      'laisse passer POST %s en multipart/form-data',
      (path) => {
        expect(
          allowed(run('POST', { 'content-type': MULTIPART, 'content-length': '20' }, path)),
        ).toBe(true);
        expect(
          allowed(
            run(
              'POST',
              { 'content-type': 'Multipart/Form-Data; boundary=y', 'content-length': '20' },
              path,
            ),
          ),
        ).toBe(true);
      },
    );

    it('refuse un formulaire urlencoded ou du texte sur cette route', () => {
      for (const type of ['application/x-www-form-urlencoded', 'text/plain']) {
        expect(refused(run('POST', { 'content-type': type, 'content-length': '9' }, IMAGES))).toBe(
          true,
        );
      }
    });

    it.each(['PUT', 'PATCH', 'DELETE'])('refuse %s en multipart sur cette route', (method) => {
      expect(
        refused(run(method, { 'content-type': MULTIPART, 'content-length': '20' }, IMAGES)),
      ).toBe(true);
    });

    it('retire en temps linéaire des milliers de « / » finaux (pas de ReDoS avant l’authentification)', () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const path = `${'/'.repeat(16_000)}a`;
      const headers = { 'content-type': 'text/plain', 'content-length': '5' };
      run('POST', headers, path); // échauffement

      const start = performance.now();
      const result = run('POST', headers, path);
      const elapsed = performance.now() - start;

      expect(refused(result)).toBe(true);
      // Seuil large pour ne pas être instable : l'ancienne expression régulière prenait ~150 ms
      expect(elapsed).toBeLessThan(50);
      warn.mockRestore();
    });

    it('n’exempte pas une route voisine ni un autre multipart', () => {
      const headers = { 'content-type': MULTIPART, 'content-length': '20' };
      expect(refused(run('POST', headers, '/api/forum/images/extra'))).toBe(true);
      expect(refused(run('POST', headers, '/api/forum/threads'))).toBe(true);
      expect(refused(run('POST', headers, '/forum/images'))).toBe(true);
      expect(
        refused(
          run(
            'POST',
            { 'content-type': 'multipart/mixed; boundary=z', 'content-length': '20' },
            IMAGES,
          ),
        ),
      ).toBe(true);
    });
  });

  it('répond un 415 en JSON, comme le reste de l’API', () => {
    const result = run('POST', { 'content-type': 'text/plain', 'content-length': '5' });

    expect(result.json).toHaveBeenCalledWith({
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: JSON_ONLY_MESSAGE,
    });
    expect(JSON_ONLY_MESSAGE).toMatch(/n’accepte que du JSON/);
  });

  it('laisse une trace d’un refus, sans cookie, corps ni donnée personnelle du chemin', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    run(
      'PATCH',
      {
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        'content-length': '9',
        cookie: 'sid=secret',
      },
      '/api/guilds/300000000000000001/moderation/members/222222222222222222',
    );

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('PATCH');
    expect(logged).toContain('application/x-www-form-urlencoded');
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('222222222222222222');
    expect(logged).toContain(':userId');
    warn.mockRestore();
  });

  it('tronque à 100 caractères un Content-Type trop long dans le log', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const type = `application/x-${'a'.repeat(200)}`;

    run('POST', { 'content-type': type, 'content-length': '5' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ contentType: type.slice(0, 100) });
    warn.mockRestore();
  });

  it('refuse un Content-Type vide sur une écriture avec corps (415)', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    expect(refused(run('POST', { 'content-type': '', 'content-length': '5' }))).toBe(true);
    warn.mockRestore();
  });
});
