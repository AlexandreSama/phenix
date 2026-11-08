import { describe, expect, it } from 'vitest';
import { emojiSchema, rolePanelInputSchema } from './role-panel.js';

const ROLE_A = '100000000000000001';
const ROLE_B = '100000000000000002';

const valid = {
  title: 'Tes jeux',
  description: null,
  channelId: '200000000000000001',
  mode: 'MULTIPLE' as const,
  options: [
    { roleId: ROLE_A, label: 'The Division 2', emoji: '🎮' },
    { roleId: ROLE_B, label: 'Valorant', emoji: null },
  ],
};

describe('rolePanelInputSchema', () => {
  it('accepte un panel valide et nettoie les espaces', () => {
    const result = rolePanelInputSchema.parse({ ...valid, title: '  Tes jeux  ' });
    expect(result.title).toBe('Tes jeux');
  });

  it('refuse deux boutons pour le même rôle, sur le doublon', () => {
    const options = [valid.options[0], { roleId: ROLE_A, label: 'Encore', emoji: null }];
    const result = rolePanelInputSchema.safeParse({ ...valid, options });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['options', 1, 'roleId'],
      message: 'Ce rôle a déjà un bouton',
    });
  });

  it('refuse un panel vide et plus de 25 boutons', () => {
    expect(rolePanelInputSchema.safeParse({ ...valid, options: [] }).success).toBe(false);
    const many = Array.from({ length: 26 }, (_, index) => ({
      roleId: `1000000000000001${String(index).padStart(2, '0')}`,
      label: `Rôle ${index}`,
      emoji: null,
    }));
    expect(rolePanelInputSchema.safeParse({ ...valid, options: many }).success).toBe(false);
  });
});

describe('emojiSchema', () => {
  it.each(['🎮', '🇫🇷', '👩‍💻', '<:phenix:123456789012345678>', '<a:feu:123456789012345678>'])(
    'accepte %s',
    (emoji) => {
      expect(emojiSchema.safeParse(emoji).success).toBe(true);
    },
  );

  it.each(['abc', '123', ':phenix:', '<:x:12>'])('refuse %s', (emoji) => {
    expect(emojiSchema.safeParse(emoji).success).toBe(false);
  });
});
