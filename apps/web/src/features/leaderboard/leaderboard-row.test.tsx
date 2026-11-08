import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeaderboardRow } from './leaderboard-row';

const entry = {
  rank: 4,
  userId: '500000000000000001',
  displayName: 'Agent Phénix',
  avatarUrl: null,
  level: 2,
  xp: 355,
  messages: 18,
};

describe('LeaderboardRow', () => {
  it('montre la progression dans le niveau, lisible par un lecteur d’écran', () => {
    render(<LeaderboardRow entry={entry} />);

    // 355 XP = niveau 2 + 100 XP sur les 220 du niveau 2
    const bar = screen.getByRole('progressbar', { name: 'Niveau 2 : 100 sur 220 XP' });
    expect(bar.getAttribute('aria-valuenow')).toBe('45');
  });

  it('affiche l’initiale quand le membre n’a pas d’avatar connu', () => {
    render(<LeaderboardRow entry={entry} />);
    expect(screen.getByText('A')).toBeTruthy();
  });
});
