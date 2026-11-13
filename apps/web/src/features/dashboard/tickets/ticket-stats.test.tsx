import type { TicketStats } from '@phenix/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketStatsPanel } from './ticket-stats';

const types: TicketStats['types'] = [
  { typeId: 1, typeName: 'Support', average: 4.3 },
  { typeId: 2, typeName: 'Recrutement', average: null },
  { typeId: null, typeName: null, average: 3 },
];
const members: TicketStats['members'] = [
  { claimedByName: 'Faye', average: 4.5 },
  { claimedByName: null, average: null },
];

const row = (list: HTMLElement, name: string) => within(list).getByText(name).closest('li')!;
const typeList = () => screen.getByRole('list', { name: 'Moyennes par type' });
const memberList = () => screen.getByRole('list', { name: 'Moyennes par membre de l’équipe' });

describe('moyennes de satisfaction', () => {
  it('affiche la moyenne sur 5 et le seuil, sans nombre de notes', () => {
    render(<TicketStatsPanel types={types} members={members} />);

    expect(row(typeList(), 'Support').textContent).toBe('Support4,3 / 5 (au moins 5 notes)');
    expect(row(typeList(), 'Type supprimé').textContent).toBe(
      'Type supprimé3,0 / 5 (au moins 5 notes)',
    );
  });

  it('n’affiche aucune valeur sous 5 notes, seulement le motif', () => {
    render(<TicketStatsPanel types={types} members={members} />);

    expect(row(typeList(), 'Recrutement').textContent).toBe(
      'RecrutementPas assez de notes (moins de 5)',
    );
  });

  it('n’affiche ni nombre de notes ni plus d’une décimale, même si une ligne en apporte', () => {
    // Défense en profondeur : une API qui renverrait encore un nombre de notes ou une moyenne
    // non arrondie ne doit rien laisser déduire à l'écran
    const leaky = [{ typeId: 9, typeName: 'Ancien', average: 4.25, count: 7 }] as never;
    render(<TicketStatsPanel types={leaky} />);

    expect(row(typeList(), 'Ancien').textContent).toBe('Ancien4,3 / 5 (au moins 5 notes)');
  });

  it('affiche les moyennes par membre de l’équipe, avec « Membre inconnu » sans pseudo', () => {
    render(<TicketStatsPanel types={types} members={members} />);

    expect(row(memberList(), 'Faye').textContent).toBe('Faye4,5 / 5 (au moins 5 notes)');
    expect(row(memberList(), 'Membre inconnu').textContent).toBe(
      'Membre inconnuPas assez de notes (moins de 5)',
    );
  });

  it('masque le bloc par membre quand il n’est pas fourni (réservé aux administrateurs)', () => {
    render(<TicketStatsPanel types={types} />);

    expect(typeList()).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Moyennes par membre de l’équipe' })).toBeNull();
    expect(screen.queryByText('Par membre de l’équipe')).toBeNull();
  });

  it('prévient que les moyennes sont indicatives, et jamais la note d’un ticket', () => {
    render(<TicketStatsPanel types={types} members={members} />);

    expect(
      screen.getByText(
        'Indicatif : ne pas fonder de décision sur ces moyennes. Seules des moyennes sont visibles, jamais la note d’un ticket.',
      ),
    ).toBeTruthy();
  });

  it('dit qu’aucune note n’a été reçue quand les listes sont vides', () => {
    render(<TicketStatsPanel types={[]} members={[]} />);

    expect(screen.getByText('Aucune note de satisfaction pour le moment')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
