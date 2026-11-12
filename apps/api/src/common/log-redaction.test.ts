import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { redactRequest, redactUrl } from './log-redaction.js';

describe('redactUrl', () => {
  it('retire la chaîne de requête : recherche, identifiants et dates n’entrent pas dans les logs', () => {
    expect(redactUrl('/api/guilds/300000000000000001/moderation/cases?q=spam&targetId=2222')).toBe(
      '/api/guilds/300000000000000001/moderation/cases',
    );
    expect(redactUrl('/api/leaderboard?page=2')).toBe('/api/leaderboard');
  });

  it('masque l’identifiant d’un membre dans la fiche de modération', () => {
    expect(redactUrl('/api/guilds/300000000000000001/moderation/members/222222222222222222')).toBe(
      '/api/guilds/300000000000000001/moderation/members/:userId',
    );
  });

  it('masque aussi l’identifiant quand la casse de l’adresse change (Express n’y est pas sensible)', () => {
    expect(redactUrl('/api/guilds/300000000000000001/MODERATION/Members/222222222222222222')).toBe(
      '/api/guilds/300000000000000001/MODERATION/Members/:userId',
    );
  });

  it('laisse les autres adresses telles quelles', () => {
    expect(redactUrl('/api/guilds/300000000000000001/tickets')).toBe(
      '/api/guilds/300000000000000001/tickets',
    );
  });
});

describe('journal des requêtes (pino-http)', () => {
  it('ne contient ni la recherche, ni l’identifiant du membre, ni les paramètres', async () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, done) {
        output += String(chunk);
        done();
      },
    });
    const log = pinoHttp({ serializers: { req: redactRequest } }, stream);
    const server = createServer((req, res) => {
      log(req, res);
      res.end('ok');
    });

    // Un appel same-origin du site envoie l'adresse de la page dans Referer
    await request(server)
      .get(
        '/api/guilds/300000000000000001/moderation/members/222222222222222222?q=motsecret&targetId=999999999999999999',
      )
      .set(
        'Referer',
        'http://localhost:5173/dashboard/300000000000000001/moderation?q=autresecret&targetId=888888888888888888',
      );

    expect(output).toContain('/api/guilds/300000000000000001/moderation/members/:userId');
    expect(output).not.toContain('motsecret');
    expect(output).not.toContain('222222222222222222');
    expect(output).not.toContain('999999999999999999');
    expect(output).not.toContain('autresecret');
    expect(output).not.toContain('888888888888888888');
  });
});
