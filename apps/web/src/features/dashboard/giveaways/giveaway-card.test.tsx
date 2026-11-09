import type { GiveawaySummary } from '@phenix/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isGiveawayBusy } from '../api';
import { GiveawayCard, giveawayState } from './giveaway-card';

const NOW = Date.parse('2026-11-09T12:00:00Z');

const giveaway = (overrides: Partial<GiveawaySummary> = {}): GiveawaySummary => ({
  id: 12,
  prize: 'Nitro',
  channelId: '400000000000000001',
  winnersCount: 1,
  requiredRoleId: null,
  endsAt: '2026-11-10T20:00:00.000Z',
  endedAt: null,
  announced: false,
  entryCount: 3,
  winners: [],
  publication: 'published',
  publishError: null,
  ...overrides,
});

const ended = (overrides: Partial<GiveawaySummary> = {}) =>
  giveaway({
    endedAt: '2026-11-10T20:00:02.000Z',
    winners: [{ id: '1', name: 'Alpha' }],
    announced: true,
    ...overrides,
  });

describe('giveawayState', () => {
  it('suit chaque étape et ne propose que les actions possibles', () => {
    const steps = [
      giveaway(),
      giveaway({ endsAt: '2026-11-09T11:59:00.000Z' }),
      ended({ announced: false }),
      ended({ announced: false, publishError: "Ce salon n'existe plus" }),
      ended(),
    ].map((entry) => giveawayState(entry, NOW));

    expect(steps.map((step) => step.actions.map((action) => action.label))).toEqual([
      ['Terminer'],
      [],
      [],
      ['Réessayer l’annonce'],
      ['Relancer'],
    ]);
    expect(steps[1]?.line).toBe('Tirage en cours… · 3 participants');
    expect(steps[2]?.line).toContain('annonce en cours…');
    expect(steps[4]?.line).toContain('Gagnant : Alpha');
  });

  it('dit quand le bot travaille encore, pour relire la liste plus souvent', () => {
    expect(isGiveawayBusy(giveaway(), NOW)).toBe(false);
    expect(isGiveawayBusy(giveaway({ publication: 'pending' }), NOW)).toBe(true);
    expect(isGiveawayBusy(giveaway({ endsAt: '2026-11-09T11:00:00.000Z' }), NOW)).toBe(true);
    expect(isGiveawayBusy(ended({ announced: false }), NOW)).toBe(true);
    expect(isGiveawayBusy(ended({ announced: false, publishError: 'x' }), NOW)).toBe(false);
    expect(isGiveawayBusy(ended(), NOW)).toBe(false);
  });
});

describe('GiveawayCard', () => {
  it('demande un second clic avant de relancer ou de supprimer', () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <GiveawayCard
        giveaway={ended()}
        channel={{ id: '400000000000000001', name: 'annonces', parentName: null }}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tirer de nouveaux gagnants' }));
    expect(onAction).toHaveBeenLastCalledWith('reroll');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    expect(onAction.mock.calls).toEqual([['reroll'], ['delete']]);
  });

  it('montre l’erreur de publication du bot', () => {
    render(
      <GiveawayCard
        giveaway={giveaway({ publication: 'error', publishError: 'Le bot ne voit pas ce salon' })}
        channel={undefined}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Le bot ne voit pas ce salon');
    expect(screen.getByText(/salon supprimé/)).toBeTruthy();
  });
});
