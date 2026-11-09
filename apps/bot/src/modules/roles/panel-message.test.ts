import type { RolePanelWithOptions } from '@phenix/database';
import { describe, expect, it } from 'vitest';
import { PANEL_FOOTER, rolePanelMessage } from './panel-message.js';

function panel(
  optionCount: number,
  mode: 'MULTIPLE' | 'UNIQUE' = 'MULTIPLE',
): RolePanelWithOptions {
  return {
    id: 7,
    guildId: '1',
    channelId: '2',
    messageId: null,
    title: 'Tes jeux',
    description: null,
    mode,
    publishedAt: null,
    publishError: null,
    createdAt: new Date(),
    options: Array.from({ length: optionCount }, (_, index) => ({
      id: index,
      panelId: 7,
      roleId: `10000000000000000${index}`,
      label: `Jeu ${index}`,
      emoji: index === 0 ? '🎮' : null,
      position: index,
    })),
  };
}

describe('rolePanelMessage', () => {
  it('range les boutons par lignes de cinq', () => {
    const { components } = rolePanelMessage(panel(7));
    expect(components.map((row) => row.components.length)).toEqual([5, 2]);
  });

  it('met le panel et le rôle dans le customId, et l’emoji sur le bouton', () => {
    const [first] = rolePanelMessage(panel(1)).components[0]!.toJSON().components as {
      custom_id: string;
      emoji?: { name: string };
    }[];
    expect(first).toMatchObject({
      custom_id: 'rolepanel:toggle:7.100000000000000000',
      emoji: { name: '🎮' },
    });
  });

  it('explique le mode dans le pied de l’embed', () => {
    const embed = rolePanelMessage(panel(1, 'UNIQUE')).embeds[0]!.toJSON();
    expect(embed.footer?.text).toBe(PANEL_FOOTER.UNIQUE);
  });
});
