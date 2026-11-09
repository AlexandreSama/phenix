import type { TicketSummary } from '@phenix/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { closingLine, TicketRow } from './ticket-row';

const base: TicketSummary = {
  id: 7,
  number: 42,
  ownerId: '1',
  ownerName: 'Alpha',
  status: 'OPEN',
  createdAt: '2026-11-07T12:00:00.000Z',
  closedAt: null,
  closedByName: null,
  messageCount: null,
  hasTranscript: false,
};
const closed = { ...base, status: 'CLOSED' as const, closedAt: '2026-11-07T13:00:00.000Z' };

describe('ligne de ticket', () => {
  it('dit qui a fermé et combien de messages ont été gardés', () => {
    expect(
      closingLine({ ...closed, closedByName: 'Modo', messageCount: 1, hasTranscript: true }),
    ).toMatch(/^Fermé le .+ par Modo · 1 message$/);
    expect(
      closingLine({ ...closed, closedByName: 'Modo', messageCount: 8, hasTranscript: true }),
    ).toMatch(/8 messages$/);
  });

  it('signale un salon supprimé à la main, sans transcript', () => {
    expect(closingLine(closed)).toMatch(/^Salon supprimé à la main le /);
    expect(closingLine(base)).toMatch(/^Ouvert le /);
  });

  it('affiche le numéro, l’auteur et l’action fournie par la page', () => {
    render(
      <ul>
        <TicketRow ticket={base} action={<a href="/x">Lire</a>} />
      </ul>,
    );
    expect(screen.getByText('#42')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lire' })).toBeTruthy();
  });
});
