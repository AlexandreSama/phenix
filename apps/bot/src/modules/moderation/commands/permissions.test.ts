import { describe, expect, it } from 'vitest';
import { moderationCommands } from '../index.js';

describe('commandes de modération', () => {
  it.each(moderationCommands.map((command) => [command.data.name, command] as const))(
    '/%s déclare la permission que le bot exige, la même que celle proposée à Discord',
    (_name, command) => {
      const proposed = command.data.toJSON().default_member_permissions;

      // Le réglage de Discord n'est qu'une suggestion qu'un administrateur peut surcharger dans
      // les réglages d'intégration : le bot la vérifie lui-même (core/interaction-router.ts)
      expect(proposed).toBeTruthy();
      expect(command.requiredPermissions).toBe(BigInt(proposed!));
    },
  );
});
