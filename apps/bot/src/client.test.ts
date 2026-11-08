import { BOT_INVITE_PERMISSIONS } from '@phenix/shared';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { BOT_PERMISSIONS } from './client.js';
import { ROLE_PANEL_FORBIDDEN_PERMISSIONS } from '@phenix/shared';

describe('BOT_PERMISSIONS', () => {
  it('correspond au nombre utilisé par le lien d’invitation du site', () => {
    expect(new PermissionsBitField(BOT_PERMISSIONS).bitfield.toString()).toBe(
      BOT_INVITE_PERMISSIONS,
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
