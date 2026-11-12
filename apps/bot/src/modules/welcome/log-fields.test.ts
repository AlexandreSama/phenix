import { DiscordAPIError } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { errorFields } from './log-fields.js';

const MEMBER_ID = '200000000000000042';
const PSEUDO = 'Agent Secret';

describe('errorFields', () => {
  it('ne garde d’une erreur Discord que son code, son statut et son type', () => {
    const err = new DiscordAPIError(
      { code: 50013, message: 'Missing Permissions' },
      50013,
      403,
      'PUT',
      `https://discord.com/api/v10/guilds/1/members/${MEMBER_ID}/roles/3`,
      { body: { nick: PSEUDO } },
    );

    const fields = errorFields(err);

    // discord.js nomme l'erreur « DiscordAPIError[code] » : aucun identifiant de membre
    expect(fields).toEqual({ code: 50013, status: 403, error: 'DiscordAPIError[50013]' });
    expect(JSON.stringify(fields)).not.toContain(MEMBER_ID);
    expect(JSON.stringify(fields)).not.toContain(PSEUDO);
  });

  it('ne recopie jamais le message d’une autre erreur, qui peut citer une valeur', () => {
    const err = new RangeError(`Invalid embed description: ${PSEUDO}`);

    expect(errorFields(err)).toEqual({ error: 'RangeError' });
  });

  it('garde le code texte d’une erreur de base (ex. Prisma P1001)', () => {
    const err = Object.assign(new Error("Can't reach database server"), { code: 'P1001' });

    expect(errorFields(err)).toEqual({ code: 'P1001', error: 'Error' });
  });

  it('accepte une valeur qui n’est pas une erreur', () => {
    expect(errorFields('oops')).toEqual({ error: 'unknown' });
  });
});
