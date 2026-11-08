import { BOT_INVITE_PERMISSIONS } from '@phenix/shared';
import { PermissionsBitField } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { BOT_PERMISSIONS } from './client.js';

describe('BOT_PERMISSIONS', () => {
  it('correspond au nombre utilisé par le lien d’invitation du site', () => {
    expect(new PermissionsBitField(BOT_PERMISSIONS).bitfield.toString()).toBe(
      BOT_INVITE_PERMISSIONS,
    );
  });
});
