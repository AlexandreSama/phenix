import type { TicketSummary } from '@phenix/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { closingLine, TicketRow } from './ticket-row';

const base: TicketSummary = {
  id: 7,
  number: 42,
  ownerId: '1',
  ownerName: 'Alpha',
  typeName: 'Support',
  claimedByName: null,
  status: 'OPEN',
  createdAt: '2026-11-07T12:00:00.000Z',
  closedAt: null,
  closedByName: null,
  messageCount: null,
  hasTranscript: false,
  closedVia: null,
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

  it('ne nomme personne pour une fermeture automatique, et garde le nombre de messages', () => {
    const line = closingLine({
      ...closed,
      closedVia: 'INACTIVITY',
      closedByName: null,
      messageCount: 3,
      hasTranscript: true,
    });
    expect(line).toMatch(/^Fermé automatiquement le .+ · 3 messages$/);
    expect(line).not.toContain('inconnu');
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

describe('mode de fermeture', () => {
  const show = (ticket: TicketSummary) =>
    render(
      <ul>
        <TicketRow ticket={ticket} />
      </ul>,
    );

  it('signale une fermeture automatique pour inactivité', () => {
    show({ ...closed, closedVia: 'INACTIVITY' });
    expect(screen.getByText('Fermé automatiquement')).toBeTruthy();
    expect(screen.queryByText('Fermé')).toBeNull();
  });

  it('signale un salon supprimé, et ne dit rien de spécial pour le bouton ou un ticket ouvert', () => {
    const { unmount } = show({ ...closed, closedVia: 'CHANNEL_DELETED' });
    expect(screen.getByText('Salon supprimé')).toBeTruthy();
    unmount();
    show({ ...closed, closedVia: 'BUTTON' });
    expect(screen.queryByText('Fermé automatiquement')).toBeNull();
    expect(screen.queryByText('Salon supprimé')).toBeNull();
  });
});

describe('prise en charge', () => {
  const show = (ticket: TicketSummary) =>
    render(
      <ul>
        <TicketRow ticket={ticket} />
      </ul>,
    );

  it('dit qui a pris le ticket en charge', () => {
    show({ ...base, claimedByName: 'Beta' });
    expect(screen.getByText('Pris en charge par Beta')).toBeTruthy();
  });

  it('n’affiche rien quand personne ne l’a pris en charge', () => {
    show(base);
    expect(screen.queryByText(/Pris en charge/)).toBeNull();
  });
});

describe('type du ticket', () => {
  const show = (ticket: TicketSummary) =>
    render(
      <ul>
        <TicketRow ticket={ticket} />
      </ul>,
    );

  it('affiche le nom du type', () => {
    show(base);
    expect(screen.getByText('Support')).toBeTruthy();
  });

  it('affiche « Type supprimé » quand le type n’existe plus', () => {
    show({ ...base, typeName: null });
    expect(screen.getByText('Type supprimé')).toBeTruthy();
  });
});
