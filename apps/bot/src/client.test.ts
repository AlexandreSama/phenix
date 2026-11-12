import { BOT_INVITE_PERMISSIONS, ROLE_PANEL_FORBIDDEN_PERMISSIONS } from '@phenix/shared';
import {
  GatewayCloseCodes,
  GatewayIntentBits,
  IntentsBitField,
  Partials,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { BOT_PERMISSIONS, createClient, createShardDisconnectHandler } from './client.js';

describe('BOT_PERMISSIONS', () => {
  it('correspond au nombre utilisé par le lien d’invitation du site', () => {
    expect(new PermissionsBitField(BOT_PERMISSIONS).bitfield.toString()).toBe(
      BOT_INVITE_PERMISSIONS,
    );
  });

  it('contient déjà ce que demande le module welcome : gérer les rôles et intégrer des liens', () => {
    expect(BOT_PERMISSIONS).toEqual(
      expect.arrayContaining([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.EmbedLinks]),
    );
  });
});

describe('createClient', () => {
  it('reçoit les arrivées et départs des membres (intent privilégié GuildMembers)', async () => {
    const client = createClient();

    expect(new IntentsBitField(client.options.intents).has(GatewayIntentBits.GuildMembers)).toBe(
      true,
    );
    await client.destroy();
  });

  it('accepte les membres partiels, pour annoncer le départ d’un membre absent du cache', async () => {
    const client = createClient();

    expect(client.options.partials).toContain(Partials.GuildMember);
    await client.destroy();
  });

  it('ne laisse toujours passer que les mentions de membres', async () => {
    const client = createClient();

    expect(client.options.allowedMentions).toEqual({ parse: ['users'] });
    await client.destroy();
  });
});

describe('createShardDisconnectHandler', () => {
  it('explique clairement une connexion refusée faute d’intent privilégié (4014)', () => {
    const logger = { fatal: vi.fn(), error: vi.fn() };

    createShardDisconnectHandler(logger)({ code: GatewayCloseCodes.DisallowedIntents }, 0);

    expect(GatewayCloseCodes.DisallowedIntents).toBe(4014);
    expect(logger.fatal).toHaveBeenCalledOnce();
    const [fields, message] = logger.fatal.mock.calls[0] as [object, string];
    expect(fields).toEqual({ code: 4014, shardId: 0 });
    expect(message).toMatch(/Server Members Intent/);
    expect(message).toMatch(/Developer Portal/);
  });

  it('journalise les autres fermetures définitives en erreur, avec leur code', () => {
    const logger = { fatal: vi.fn(), error: vi.fn() };

    createShardDisconnectHandler(logger)({ code: GatewayCloseCodes.AuthenticationFailed }, 1);

    expect(logger.fatal).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      { code: GatewayCloseCodes.AuthenticationFailed, shardId: 1 },
      expect.any(String),
    );
  });
});

describe('ROLE_PANEL_FORBIDDEN_PERMISSIONS', () => {
  it('reprend les valeurs de discord.js, nom pour nom', () => {
    for (const [name, bit] of Object.entries(ROLE_PANEL_FORBIDDEN_PERMISSIONS)) {
      const expected = PermissionFlagsBits[name as keyof typeof PermissionFlagsBits];
      expect({ name, bit }).toEqual({ name, bit: expected });
    }
  });
});
