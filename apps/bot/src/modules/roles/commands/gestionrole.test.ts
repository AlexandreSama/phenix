import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { gestionrole } from './gestionrole.js';

const ROLE = {
  id: '300000000000000001',
  position: 2,
  managed: false,
  editable: true,
  toString: () => '@Gamer',
};

/** Fausse interaction : un modérateur au rôle 10 agit sur un membre au rôle 1. */
function fakeInteraction(subcommand: 'ajouter' | 'retirer', owned: string[]) {
  const target = {
    id: '200000000000000002',
    roles: {
      highest: { position: 1 },
      cache: new Map(owned.map((id) => [id, {}])),
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    toString: () => '@Membre',
  };
  return {
    target,
    inCachedGuild: () => true,
    guildId: '100000000000000001',
    guild: { ownerId: '999', channels: { cache: new Map() } },
    user: { id: '200000000000000001', tag: 'modo', toString: () => '@Modo' },
    member: { roles: { highest: { position: 10 } } },
    options: {
      getSubcommand: () => subcommand,
      getMember: () => target,
      getRole: () => ROLE,
    },
    reply: vi.fn(),
  };
}

const context = {
  configs: { get: vi.fn(async () => null) },
  logger: { warn: vi.fn() },
} as unknown as BotContext;

async function run(interaction: ReturnType<typeof fakeInteraction>) {
  await gestionrole.execute(interaction as unknown as ChatInputCommandInteraction, context);
  const payload = interaction.reply.mock.calls[0]?.[0] as { content: string } | undefined;
  return payload?.content;
}

describe('/gestionrole', () => {
  it('donne le rôle, avec le modérateur dans le journal d’audit', async () => {
    const interaction = fakeInteraction('ajouter', []);

    expect(await run(interaction)).toBe('Rôle @Gamer donné à @Membre.');
    expect(interaction.target.roles.add).toHaveBeenCalledWith(ROLE, 'modo via /gestionrole');
  });

  it('refuse de donner un rôle que le membre a déjà', async () => {
    const interaction = fakeInteraction('ajouter', [ROLE.id]);

    expect(await run(interaction)).toBe('@Membre a déjà le rôle @Gamer.');
    expect(interaction.target.roles.add).not.toHaveBeenCalled();
  });

  it('retire le rôle', async () => {
    const interaction = fakeInteraction('retirer', [ROLE.id]);

    expect(await run(interaction)).toBe('Rôle @Gamer retiré à @Membre.');
    expect(interaction.target.roles.remove).toHaveBeenCalled();
  });
});
