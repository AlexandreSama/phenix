import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketPanelPreview } from './ticket-panel-preview';

const show = () =>
  render(<TicketPanelPreview title="Aide" description="" buttonLabel="Choisis un motif" />);

describe('TicketPanelPreview', () => {
  it('montre un seul bouton, avec le texte réglé sur le site', () => {
    show();
    expect(screen.getAllByText('🎫 Choisis un motif')).toHaveLength(1);
  });

  it('garde le texte par défaut sans texte de bouton', () => {
    render(<TicketPanelPreview title="Aide" description="" buttonLabel="" />);
    expect(screen.getByText('🎫 Ouvrir un ticket')).toBeTruthy();
  });
});
