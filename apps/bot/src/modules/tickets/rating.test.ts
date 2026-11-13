import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type MessageComponentInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { createRatingHandler, RATING_REPLIES, requestRating } from './rating.js';

const database = vi.hoisted(() => ({ rateTicket: vi.fn() }));
vi.mock('@phenix/database', () => database);

const OWNER = '200000000000000001';

function fakeRatingButton(userId = OWNER) {
  return {
    isButton: () => true,
    // Un message privé : pas de serveur
    inCachedGuild: () => false,
    guildId: null,
    user: { id: userId },
    reply: vi.fn(async (_payload: unknown) => {}),
    update: vi.fn(async (_payload: unknown) => {}),
  };
}

function setup() {
  const context = {
    db: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as BotContext;
  const [handler] = createRatingHandler();
  const click = (interaction: ReturnType<typeof fakeRatingButton>, id: string | undefined) =>
    handler!.execute(interaction as unknown as MessageComponentInteraction, id, context);
  return { context, click, handler: handler! };
}

beforeEach(() => {
  database.rateTicket.mockReset().mockResolvedValue('rated');
});

describe('noter un ticket', () => {
  it('écoute le préfixe ticket:rate', () => {
    expect(setup().handler.prefix).toBe('ticket:rate');
  });

  it('enregistre la note de l’auteur, retire les boutons et remercie', async () => {
    const { click } = setup();
    const interaction = fakeRatingButton();

    await click(interaction, '7:4');

    expect(database.rateTicket).toHaveBeenCalledWith({}, 7, OWNER, 4);
    expect(interaction.update).toHaveBeenCalledWith({
      content: 'Merci pour ta note !',
      components: [],
    });
  });

  it('une seconde note répond « déjà noté » et retire les boutons', async () => {
    database.rateTicket.mockResolvedValue('already_rated');
    const { click } = setup();
    const interaction = fakeRatingButton();

    await click(interaction, '7:2');

    expect(interaction.update).toHaveBeenCalledWith({
      content: 'Tu as déjà noté ce ticket.',
      components: [],
    });
  });

  it('refus (autre personne, hors fenêtre, ticket indisponible) : message neutre, boutons gardés', async () => {
    database.rateTicket.mockResolvedValue('refused');
    const { click } = setup();
    const interaction = fakeRatingButton('200000000000000099');

    await click(interaction, '7:5');

    expect(database.rateTicket).toHaveBeenCalledWith({}, 7, '200000000000000099', 5);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: RATING_REPLIES.refused,
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    '',
    '7',
    '7:',
    ':4',
    '7:0',
    '7:6',
    '7:-1',
    '7:2.5',
    '7:abc',
    '7:1e0',
    'x:3',
    '7:03',
    '7:4:1',
    '99999999999:3',
    '2147483648:3',
    '0:3',
    '07:3',
  ])('ignore un identifiant invalide (%s)', async (id) => {
    const { click } = setup();
    const interaction = fakeRatingButton();

    await click(interaction, id);

    expect(database.rateTicket).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it.each([
    ['2147483647:3', 2_147_483_647, 3],
    ['7:1', 7, 1],
    ['7:5', 7, 5],
  ])('accepte %s (bornes de l’identifiant et de la note)', async (id, ticketId, rating) => {
    const { click } = setup();

    await click(fakeRatingButton(), id);

    expect(database.rateTicket).toHaveBeenCalledWith({}, ticketId, OWNER, rating);
  });

  it('ignore ce qui n’est pas un bouton', async () => {
    const { click } = setup();
    const interaction = { ...fakeRatingButton(), isButton: () => false };

    await click(interaction, '7:4');

    expect(database.rateTicket).not.toHaveBeenCalled();
  });
});

const cannotDm = () =>
  new DiscordAPIError(
    { code: RESTJSONErrorCodes.CannotSendMessagesToThisUser, message: 'Cannot send' },
    RESTJSONErrorCodes.CannotSendMessagesToThisUser,
    403,
    'POST',
    '/channels/123/messages',
    {},
  );

describe('demander une note après la fermeture', () => {
  const ticket = { id: 7, number: 42, ownerId: OWNER };

  function setupRequest() {
    const send = vi.fn(async (_payload: unknown) => ({}));
    const fetch = vi.fn(async (_id: string) => ({ send }));
    const logger = { info: vi.fn(), warn: vi.fn() };
    const client = { users: { fetch } };
    return {
      send,
      fetch,
      logger,
      request: () => requestRating(client as never, ticket, 'Phénix', logger),
    };
  }

  it('envoie à l’auteur un MP avec les cinq boutons', async () => {
    const { request, send, fetch } = setupRequest();

    await request();

    expect(fetch).toHaveBeenCalledWith(OWNER);
    const payload = send.mock.calls[0]?.[0] as {
      content: string;
      components: { toJSON(): { components: unknown[] } }[];
    };
    expect(payload.content).toContain('Ta note est enregistrée avec ce ticket');
    expect(payload.content).not.toContain('anonyme');
    expect(payload.components[0]?.toJSON().components).toHaveLength(5);
  });

  it('MP refusés (50007) : un log info sans identifiant ni pseudo, aucune erreur', async () => {
    const { request, send, logger } = setupRequest();
    send.mockRejectedValue(cannotDm());

    await expect(request()).resolves.toBeUndefined();

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toContain(OWNER);
    expect(logged).not.toContain('Phénix');
  });

  it('membre introuvable ou autre échec : jamais d’erreur, rien d’identifiant dans le log', async () => {
    const { request, fetch, logger } = setupRequest();
    fetch.mockRejectedValue(new Error(`Unknown User ${OWNER}`));

    await expect(request()).resolves.toBeUndefined();

    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls]);
    expect(logged).not.toContain(OWNER);
    // Ce n'est pas un refus de MP : un warn (sans code Discord), jamais un info
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({ code: undefined }, expect.any(String));
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('autre erreur Discord : le warn ne journalise que son code, ni l’erreur ni l’identifiant', async () => {
    const { request, fetch, logger } = setupRequest();
    fetch.mockRejectedValue(
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.UnknownUser, message: `Unknown User ${OWNER}` },
        RESTJSONErrorCodes.UnknownUser,
        404,
        'GET',
        `/users/${OWNER}`,
        {},
      ),
    );

    await expect(request()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { code: RESTJSONErrorCodes.UnknownUser },
      expect.any(String),
    );
    expect(logger.info).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(OWNER);
  });
});
