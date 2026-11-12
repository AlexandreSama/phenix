import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { MEMBER_ID, PSEUDO, captureLogger, discordErrorWithMemberData } from './test-fixtures.js';
import { giveWelcomeRole, welcomeRoleRefusal } from './welcome-role.js';

const GUILD = '100000000000000001';
const ROLE = '500000000000000001';

const role = (overrides: object = {}) => ({
  id: ROLE,
  editable: true,
  managed: false,
  permissions: { bitfield: PermissionFlagsBits.SendMessages },
  ...overrides,
});
const can = { guildId: GUILD, botCanManageRoles: true };

describe('welcomeRoleRefusal', () => {
  it('accepte un rôle ordinaire que le bot peut donner', () => {
    expect(welcomeRoleRefusal(role(), can)).toBeNull();
  });

  // Avec discord.js, `editable` vaut déjà false si le bot n'a pas ManageRoles ou si le rôle est
  // géré par une intégration : ces deux causes doivent passer avant « rôle au-dessus du bot ».
  it.each([
    ['role-missing', undefined, can],
    ['role-above-bot', role({ editable: false }), can],
    ['missing-manage-roles', role({ editable: false }), { ...can, botCanManageRoles: false }],
    [
      'missing-manage-roles',
      role({ editable: false, managed: true }),
      { ...can, botCanManageRoles: false },
    ],
    ['role-managed', role({ editable: false, managed: true }), can],
    ['everyone', role({ id: GUILD }), can],
    [
      'forbidden-permissions',
      role({ permissions: { bitfield: PermissionFlagsBits.BanMembers } }),
      can,
    ],
    [
      'forbidden-permissions',
      role({ permissions: { bitfield: PermissionFlagsBits.ManageNicknames } }),
      can,
    ],
  ] as const)('refuse : %s', (reason, candidate, context) => {
    expect(welcomeRoleRefusal(candidate, context)).toBe(reason);
  });
});

function fakeMember({ roleInCache = role(), manageRoles = true } = {}) {
  const add = vi.fn().mockResolvedValue(undefined);
  const member = {
    id: MEMBER_ID,
    displayName: PSEUDO,
    guild: {
      id: GUILD,
      roles: { cache: new Map(roleInCache ? [[ROLE, roleInCache]] : []) },
      members: { me: { permissions: { has: (bit: bigint) => manageRoles && bit !== 0n } } },
    },
    roles: { add },
  };
  return { member: member as unknown as GuildMember, add };
}

describe('giveWelcomeRole', () => {
  it('donne le rôle avec une raison lisible dans le journal d’audit', async () => {
    const { member, add } = fakeMember();
    const { logger } = captureLogger();

    await giveWelcomeRole(member, ROLE, logger);

    expect(add).toHaveBeenCalledWith(member.guild.roles.cache.get(ROLE), "Rôle d'arrivée");
  });

  it('ne donne pas un rôle refusé, et dit pourquoi sans nommer le membre', async () => {
    const { member, add } = fakeMember({ manageRoles: false });
    const { logger, lines } = captureLogger();

    await giveWelcomeRole(member, ROLE, logger);

    expect(add).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      guildId: GUILD,
      roleId: ROLE,
      reason: 'missing-manage-roles',
    });
    expect(lines[0]).not.toContain(MEMBER_ID);
    expect(lines[0]).not.toContain(PSEUDO);
  });

  it('journalise un refus de Discord sans l’ID ni le pseudo du membre', async () => {
    const { member, add } = fakeMember();
    add.mockRejectedValue(discordErrorWithMemberData());
    const { logger, lines } = captureLogger();

    await expect(giveWelcomeRole(member, ROLE, logger)).resolves.toBeUndefined();

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      code: 50013,
      status: 403,
      guildId: GUILD,
      roleId: ROLE,
    });
    expect(lines[0]).not.toContain(MEMBER_ID);
    expect(lines[0]).not.toContain(PSEUDO);
  });
});
