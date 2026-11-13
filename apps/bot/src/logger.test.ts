import { DiscordAPIError } from 'discord.js';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

const SECRET = 'SECRET-REPONSE';

function capture() {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += String(chunk);
      done();
    },
  });
  return { stream, read: () => output };
}

/** Une erreur Discord telle que @discordjs/rest la lève : le corps envoyé reste sur `requestBody`. */
function discordError() {
  return new DiscordAPIError(
    { code: 50013, message: 'Missing Permissions' },
    50013,
    403,
    'POST',
    'https://discord.com/api/v10/channels/1/messages',
    { body: { embeds: [{ title: 'Pseudo', description: SECRET }] }, files: [] },
  );
}

describe('journal du bot', () => {
  it('ne laisse pas le corps d’une requête Discord (réponses d’un formulaire) entrer dans les logs', () => {
    const { stream, read } = capture();
    const log = createLogger(stream);

    log.error({ err: discordError(), interactionId: '1' }, 'Échec du traitement');
    log.warn({ err: discordError(), guildId: '2' }, 'Création du salon de ticket refusée');

    const output = read();
    expect(output).toContain('Échec du traitement');
    expect(output).toContain('Missing Permissions');
    expect(output).not.toContain(SECRET);
  });

  it('masque aussi le corps d’une requête sur une erreur imbriquée', () => {
    const { stream, read } = capture();
    const log = createLogger(stream);

    log.error({ error: discordError() }, 'Échec');

    expect(read()).not.toContain(SECRET);
  });
});
