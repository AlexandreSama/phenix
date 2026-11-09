import { describe, expect, it } from 'vitest';
import { checkRoleChange, type RoleChangeCheck } from './role-check.js';

const base: RoleChangeCheck = {
  actorId: 'modo',
  targetId: 'membre',
  ownerId: 'proprio',
  actorTop: 10,
  targetTop: 2,
  role: { position: 5, managed: false, isEveryone: false, botCanEdit: true },
};

describe('checkRoleChange', () => {
  it('autorise un rôle sous celui du modérateur, pour un membre sous lui', () => {
    expect(checkRoleChange(base)).toBe(null);
  });

  it('refuse un rôle égal ou supérieur au sien', () => {
    expect(checkRoleChange({ ...base, role: { ...base.role, position: 10 } })).toContain(
      'égal ou supérieur à ton rôle',
    );
  });

  it('refuse d’agir sur un membre placé au-dessus de soi', () => {
    expect(checkRoleChange({ ...base, targetTop: 12 })).toContain('Ce membre a un rôle');
  });

  it('laisse le propriétaire tout faire, sauf ce que le bot ne peut pas', () => {
    const owner = { ...base, actorId: 'proprio', actorTop: 1, targetTop: 20 };
    expect(checkRoleChange(owner)).toBe(null);
    expect(checkRoleChange({ ...owner, role: { ...base.role, botCanEdit: false } })).toContain(
      'place mon rôle au-dessus',
    );
  });

  it('refuse @everyone et les rôles d’intégration', () => {
    expect(checkRoleChange({ ...base, role: { ...base.role, isEveryone: true } })).toContain(
      '@everyone',
    );
    expect(checkRoleChange({ ...base, role: { ...base.role, managed: true } })).toContain(
      'intégration',
    );
  });
});
