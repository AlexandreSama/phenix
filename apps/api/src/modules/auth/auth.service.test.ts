import { describe, expect, it } from 'vitest';
import { avatarUrl } from './auth.service.js';

describe('avatarUrl', () => {
  it('pointe vers l’avatar choisi par l’utilisateur', () => {
    expect(avatarUrl('200000000000000001', 'abc')).toBe(
      'https://cdn.discordapp.com/avatars/200000000000000001/abc.png?size=128',
    );
  });

  it('retombe sur un avatar par défaut de Discord', () => {
    expect(avatarUrl('200000000000000001', null)).toMatch(
      /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/,
    );
  });
});
