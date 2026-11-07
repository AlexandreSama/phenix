import { describe, expect, it } from 'vitest';
import { commands } from '../commands.js';
import type { SlashCommand } from './command.js';
import { createCommandRegistry } from './registry.js';

describe('createCommandRegistry', () => {
  it('refuse deux commandes du même nom', () => {
    const fake = { data: { name: 'ping', toJSON: () => ({ name: 'ping' }) } } as SlashCommand;
    expect(() => createCommandRegistry([fake, fake])).toThrow('Commande en double : /ping');
  });

  it('indexe toutes les commandes du bot', () => {
    expect(createCommandRegistry(commands).size).toBe(commands.length);
  });
});

describe('définitions des commandes', () => {
  // toJSON() valide les contraintes de Discord : nom en minuscules, longueurs, options…
  it.each(commands.map((command) => [command.data.name, command] as const))(
    '/%s est acceptable pour Discord',
    (_name, command) => {
      const json = command.data.toJSON();
      expect(json.name).toMatch(/^[\p{Ll}\p{N}_-]{1,32}$/u);
      expect(json.description?.length).toBeGreaterThan(0);
      expect(json.description?.length).toBeLessThanOrEqual(100);
    },
  );
});
