import { describe, expect, it } from 'vitest';
import { commands, ownerCommands } from './commands.js';

/**
 * Les commandes dont le contrôle est dans leur code plutôt que dans `requiredPermissions` :
 * /broadcast est réservée aux propriétaires du bot (`ownerIds`), pas à une permission Discord.
 */
const CHECKED_BY_CODE = new Set(['broadcast']);

const guarded = [...commands, ...ownerCommands].filter(
  (command) => command.data.toJSON().default_member_permissions,
);

describe('permissions des commandes', () => {
  it('au moins une commande propose une permission par défaut (le test ne tourne pas à vide)', () => {
    expect(guarded.length).toBeGreaterThan(10);
  });

  it.each(
    guarded
      .filter((command) => !CHECKED_BY_CODE.has(command.data.name))
      .map((command) => [command.data.name, command] as const),
  )('/%s : la permission proposée à Discord est aussi exigée par le bot', (_name, command) => {
    // `setDefaultMemberPermissions` n'est qu'une suggestion qu'un administrateur peut surcharger dans
    // les réglages d'intégration : sans `requiredPermissions`, le bot laisserait passer
    expect(command.requiredPermissions).toBe(
      BigInt(command.data.toJSON().default_member_permissions!),
    );
  });

  it('une commande qui exige une permission la propose aussi à Discord (même valeur)', () => {
    for (const command of [...commands, ...ownerCommands]) {
      if (command.requiredPermissions === undefined) continue;
      expect(BigInt(command.data.toJSON().default_member_permissions ?? '0')).toBe(
        command.requiredPermissions,
      );
    }
  });
});
