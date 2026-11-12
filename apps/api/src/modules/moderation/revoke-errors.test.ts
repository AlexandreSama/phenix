import { DiscordAPIError } from '@discordjs/rest';
import { describe, expect, it } from 'vitest';
import { classifyDiscordError, discordErrorCode } from './revoke-errors.js';

const discordError = (code: number, status: number) =>
  new DiscordAPIError({ code, message: 'x' }, code, status, 'PUT', '/guilds/1/bans/2', {
    body: undefined,
    files: undefined,
  });

describe('classifyDiscordError', () => {
  it('10026 « Unknown Ban » : le ban est déjà levé, ce qui revient au résultat voulu', () => {
    expect(classifyDiscordError(discordError(10026, 404))).toBe('already-lifted');
  });

  it('50013 « Missing Permissions » : le bot est trop bas ou n’a pas la permission', () => {
    expect(classifyDiscordError(discordError(50013, 403))).toBe('bot-too-low');
  });

  it('50001 « Missing Access » : le bot ne voit pas ce serveur ou ce membre, ce n’est pas une panne', () => {
    expect(classifyDiscordError(discordError(50001, 403))).toBe('bot-too-low');
  });

  it('10007 « Unknown Member » : le membre n’est plus sur le serveur', () => {
    expect(classifyDiscordError(discordError(10007, 404))).toBe('unknown-member');
  });

  it.each([
    ['limite de débit', discordError(0, 429)],
    ['panne de Discord', discordError(0, 503)],
    ['un autre refus (50007)', discordError(50007, 403)],
    ['une erreur réseau', new Error('ECONNRESET')],
    ['une valeur inattendue', 'oups'],
  ])('%s : Discord est indisponible, la sanction ne doit pas être touchée', (_nom, err) => {
    expect(classifyDiscordError(err)).toBe('unavailable');
  });
});

describe('discordErrorCode', () => {
  it('donne le code de Discord (50013 et 50001 se distinguent), pas le statut HTTP', () => {
    expect(discordErrorCode(discordError(50013, 403))).toBe(50013);
    expect(discordErrorCode(discordError(50001, 403))).toBe(50001);
  });

  it('dit « network » pour ce qui ne vient pas de Discord', () => {
    expect(discordErrorCode(new Error('ECONNRESET'))).toBe('network');
  });
});
