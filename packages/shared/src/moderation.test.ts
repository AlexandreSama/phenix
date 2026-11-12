import { describe, expect, it } from 'vitest';
import { auditReason, checkTarget, type TargetCheck } from './moderation.js';

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

describe('auditReason', () => {
  it('nomme qui agit et la raison, ou « Aucune raison fournie »', () => {
    expect(auditReason('modo', null)).toBe('modo : Aucune raison fournie');
    expect(auditReason('modo', 'Spam')).toBe('modo : Spam');
  });

  it('dit quand la levée vient du tableau de bord', () => {
    expect(auditReason('modo', 'Erreur', 'dashboard')).toBe('modo (tableau de bord) : Erreur');
  });

  it('coupe par caractère, pas au milieu d’un emoji : l’en-tête HTTP du journal d’audit reste valide', () => {
    const reason = auditReason('modo', '😀'.repeat(600), 'dashboard');

    expect(Array.from(reason)).toHaveLength(512);
    // @discordjs/rest encode la raison avec encodeURIComponent, qui lève sur une demi-paire isolée
    expect(() => encodeURIComponent(reason)).not.toThrow();
  });

  it('remplace une demi-paire isolée plutôt que de la laisser casser l’en-tête', () => {
    const reason = auditReason('modo', 'a\ud800b');

    expect(reason).toBe('modo : a\ufffdb');
    expect(() => encodeURIComponent(reason)).not.toThrow();
  });

  it('tient dans les 512 caractères du journal d’audit de Discord', () => {
    expect(auditReason('modo', 'x'.repeat(600))).toHaveLength(512);
    expect(auditReason('modo', 'x'.repeat(600), 'dashboard')).toHaveLength(512);
  });
});
