import { describe, expect, it } from 'vitest';
import {
  blendNames,
  EIGHT_BALL_ANSWERS,
  pickAnswer,
  progressBar,
  shipScore,
  shipVerdict,
} from './logic.js';

describe('pickAnswer', () => {
  it('donne la première et la dernière réponse aux extrémités du hasard', () => {
    expect(pickAnswer(() => 0)).toBe(EIGHT_BALL_ANSWERS[0]);
    expect(pickAnswer(() => 0.9999)).toBe(EIGHT_BALL_ANSWERS.at(-1));
  });
});

describe('shipScore', () => {
  const alice = '123456789012345678';
  const bob = '876543210987654321';

  it('ne dépend pas de l’ordre des deux personnes', () => {
    expect(shipScore(alice, bob)).toBe(shipScore(bob, alice));
  });

  it('reste entre 0 et 100', () => {
    for (let i = 0; i < 200; i++) {
      const score = shipScore(`${i}`, `${i * 7919}`);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('vaut 100 avec soi-même', () => {
    expect(shipScore(alice, alice)).toBe(100);
  });
});

describe('shipVerdict, progressBar, blendNames', () => {
  it('choisit le verdict selon le score', () => {
    expect(shipVerdict(95)).toContain('Âmes sœurs');
    expect(shipVerdict(5)).toContain('Aucune chance');
  });

  it('remplit la barre proportionnellement', () => {
    expect(progressBar(70)).toBe('███████░░░');
    expect(progressBar(0)).toBe('░░░░░░░░░░');
  });

  it('mélange les deux noms', () => {
    // « Age » (moitié de Agent, arrondie au-dessus) + « ter » (moitié de Hunter)
    expect(blendNames('Agent', 'Hunter')).toBe('Ageter');
  });
});
