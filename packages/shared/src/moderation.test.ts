import { describe, expect, it } from 'vitest';
import { checkTarget, type TargetCheck } from './guards.js';

const base: TargetCheck = {
  moderatorId: 'mod',
  targetId: 'cible',
  botId: 'bot',
  ownerId: 'proprio',
  moderatorPosition: 5,
  targetPosition: 2,
};

describe('checkTarget', () => {
  it('autorise un modérateur au-dessus de sa cible', () => {
    expect(checkTarget(base)).toBeNull();
  });

  it('refuse de se viser soi-même, le bot ou le propriétaire', () => {
    expect(checkTarget({ ...base, targetId: 'mod' })).toContain('toi-même');
    expect(checkTarget({ ...base, targetId: 'bot' })).toContain('moi-même');
    expect(checkTarget({ ...base, targetId: 'proprio' })).toContain('propriétaire');
  });

  it('refuse une cible de rang égal ou supérieur', () => {
    expect(checkTarget({ ...base, targetPosition: 5 })).toContain('égal ou supérieur');
    expect(checkTarget({ ...base, targetPosition: 9 })).toContain('égal ou supérieur');
  });

  it('laisse le propriétaire sanctionner n’importe qui', () => {
    expect(checkTarget({ ...base, moderatorId: 'proprio', targetPosition: 9 })).toBeNull();
  });
});
