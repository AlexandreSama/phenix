import { describe, expect, it } from 'vitest';
import { createGuildRateLimiter, createMemberPause } from './join-limiter.js';

const GUILD = '100000000000000001';
const OTHER_GUILD = '100000000000000002';

function clock() {
  let time = 0;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe('createGuildRateLimiter (anti-raid)', () => {
  it('laisse passer 10 messages par minute et par serveur, pas le onzième', () => {
    const { now } = clock();
    const limiter = createGuildRateLimiter({ max: 10, windowMs: 60_000, now });

    const results = Array.from({ length: 11 }, () => limiter.take(GUILD).allowed);

    expect(results.slice(0, 10)).toEqual(Array(10).fill(true));
    expect(results[10]).toBe(false);
  });

  it('fenêtre glissante : une place se libère 60 s après le plus ancien message', () => {
    const { now, advance } = clock();
    const limiter = createGuildRateLimiter({ max: 2, windowMs: 60_000, now });

    limiter.take(GUILD); // t = 0
    advance(30_000);
    limiter.take(GUILD); // t = 30 s
    expect(limiter.take(GUILD).allowed).toBe(false);

    advance(29_999); // t = 59,999 s : le premier compte encore
    expect(limiter.take(GUILD).allowed).toBe(false);
    advance(1); // t = 60 s : le premier sort de la fenêtre
    expect(limiter.take(GUILD).allowed).toBe(true);
    expect(limiter.take(GUILD).allowed).toBe(false);
  });

  it('deux serveurs ont chacun leur fenêtre', () => {
    const { now } = clock();
    const limiter = createGuildRateLimiter({ max: 1, windowMs: 60_000, now });

    expect(limiter.take(GUILD).allowed).toBe(true);
    expect(limiter.take(GUILD).allowed).toBe(false);
    expect(limiter.take(OTHER_GUILD).allowed).toBe(true);
  });

  it('ne demande qu’un seul avertissement par fenêtre de dépassement', () => {
    const { now, advance } = clock();
    const limiter = createGuildRateLimiter({ max: 1, windowMs: 60_000, now });

    limiter.take(GUILD);
    const first = limiter.take(GUILD);
    const second = limiter.take(GUILD);
    advance(59_999);
    const stillSameWindow = limiter.take(GUILD);
    advance(60_001);
    limiter.take(GUILD); // de nouveau permis
    const nextWindow = limiter.take(GUILD);

    expect(first).toEqual({ allowed: false, warn: true });
    expect(second).toEqual({ allowed: false, warn: false });
    expect(stillSameWindow).toEqual({ allowed: false, warn: false });
    expect(nextWindow).toEqual({ allowed: false, warn: true });
  });

  it('borne le nombre de serveurs suivis et oublie les fenêtres échues', () => {
    const { now, advance } = clock();
    const limiter = createGuildRateLimiter({ max: 1, windowMs: 60_000, now, maxKeys: 3 });

    for (const id of ['1', '2', '3']) limiter.take(id);
    expect(limiter.size).toBe(3);

    advance(60_000);
    limiter.take('4'); // les trois premiers ont échu : ménage
    expect(limiter.size).toBe(1);

    for (const id of ['5', '6', '7', '8']) limiter.take(id);
    expect(limiter.size).toBeLessThanOrEqual(3);
  });
});

describe('createMemberPause (une annonce par membre toutes les 10 min)', () => {
  it('refuse une deuxième annonce du même type pendant 10 minutes', () => {
    const { now, advance } = clock();
    const pause = createMemberPause({ ttlMs: 600_000, now });

    expect(pause.take('welcome', GUILD, '200000000000000001')).toBe(true);
    advance(599_999);
    expect(pause.take('welcome', GUILD, '200000000000000001')).toBe(false);
    advance(1);
    expect(pause.take('welcome', GUILD, '200000000000000001')).toBe(true);
  });

  it('compte à part l’arrivée et le départ, les membres et les serveurs', () => {
    const { now } = clock();
    const pause = createMemberPause({ ttlMs: 600_000, now });

    expect(pause.take('welcome', GUILD, '200000000000000001')).toBe(true);
    expect(pause.take('goodbye', GUILD, '200000000000000001')).toBe(true);
    expect(pause.take('welcome', GUILD, '200000000000000002')).toBe(true);
    expect(pause.take('welcome', OTHER_GUILD, '200000000000000001')).toBe(true);
    expect(pause.take('welcome', GUILD, '200000000000000001')).toBe(false);
  });

  it('reste bornée même si toutes les pauses sont en cours', () => {
    const { now, advance } = clock();
    const pause = createMemberPause({ ttlMs: 600_000, now, maxKeys: 3 });

    for (const id of ['1', '2', '3', '4', '5']) pause.take('welcome', GUILD, id);
    expect(pause.size).toBe(3);

    advance(600_000);
    pause.take('welcome', GUILD, '6'); // les pauses échues sont purgées
    expect(pause.size).toBe(1);
  });
});
