import type { MessageComponentInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rolePanelButton } from './toggle.js';
import type { BotContext } from '../../core/context.js';

const database = vi.hoisted(() => ({ findRolePanel: vi.fn() }));
vi.mock('@phenix/database', () => database);

const GUILD = '100000000000000001';
const [RED, BLUE, GREEN] = ['200000000000000001', '200000000000000002', '200000000000000003'];

function panel(mode: 'MULTIPLE' | 'UNIQUE') {
  return {
    id: 7,
    guildId: GUILD,
    title: 'Équipes',
    mode,
    options: [RED, BLUE, GREEN].map((roleId) => ({ roleId })),
  };
}

const role = (id: string, editable = true) => ({
  id,
  editable,
  permissions: { bitfield: 0n },
  toString: () => `<@&${id}>`,
});

/** Faux clic : un membre qui a déjà les rôles `owned`. */
function fakeClick(roleId: string, owned: string[], roles = [role(RED), role(BLUE), role(GREEN)]) {
  const member = {
    roles: {
      cache: new Map(owned.map((id) => [id, {}])),
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
  };
  return {
    isButton: () => true,
    inCachedGuild: () => true,
    guildId: GUILD,
    guild: { roles: { cache: new Map(roles.map((r) => [r.id, r])) } },
    member,
    reply: vi.fn(),
    customRoleId: roleId,
  };
}

const context = { db: {}, logger: { warn: vi.fn() } } as unknown as BotContext;

async function click(interaction: ReturnType<typeof fakeClick>) {
  await rolePanelButton.execute(
    interaction as unknown as MessageComponentInteraction,
    `7.${interaction.customRoleId}`,
    context,
  );
  const payload = interaction.reply.mock.calls[0]?.[0] as { content: string } | undefined;
  return payload?.content;
}

beforeEach(() => {
  database.findRolePanel.mockResolvedValue(panel('MULTIPLE') as never);
});

describe('bouton de panel', () => {
  it('donne le rôle, puis le retire au clic suivant', async () => {
    const first = fakeClick(RED, []);
    expect(await click(first)).toBe(`Rôle <@&${RED}> ajouté.`);
    expect(first.member.roles.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: RED }),
      'Panel de rôles « Équipes »',
    );

    const second = fakeClick(RED, [RED]);
    expect(await click(second)).toBe(`Rôle <@&${RED}> retiré.`);
    expect(second.member.roles.remove).toHaveBeenCalled();
  });

  it('en mode « un seul rôle », remplace le rôle du même panel', async () => {
    database.findRolePanel.mockResolvedValue(panel('UNIQUE') as never);
    const interaction = fakeClick(BLUE, [RED]);

    expect(await click(interaction)).toBe(`Rôle <@&${BLUE}> ajouté, à la place de <@&${RED}>.`);
    expect(interaction.member.roles.remove).toHaveBeenCalledWith([RED], expect.any(String));
  });

  it('refuse un bouton qui ne correspond plus au panel', async () => {
    database.findRolePanel.mockResolvedValue({ ...panel('MULTIPLE'), guildId: '999' } as never);
    expect(await click(fakeClick(RED, []))).toContain("n'est plus à jour");
  });

  it('refuse un rôle passé au-dessus du bot depuis la création du panel', async () => {
    const interaction = fakeClick(RED, [], [role(RED, false)]);
    expect(await click(interaction)).toContain('au-dessus du mien');
    expect(interaction.member.roles.add).not.toHaveBeenCalled();
  });

  it('prévient le membre si Discord refuse, sans laisser remonter l’erreur', async () => {
    const interaction = fakeClick(RED, []);
    interaction.member.roles.add.mockRejectedValue(new Error('Missing Permissions'));

    expect(await click(interaction)).toContain('Discord a refusé');
  });
});
