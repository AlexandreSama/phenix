import type { TicketTypeSummary } from '@phenix/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketPanelPreview } from './ticket-panel-preview';

const types = (count: number): TicketTypeSummary[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Type ${i + 1}`,
    description: null,
    emoji: i === 0 ? '🐛' : null,
    categoryId: '1',
    staffRoleIds: ['2'],
    inactivityHours: null,
    questionCount: 0,
  }));

const show = (count: number) =>
  render(
    <TicketPanelPreview
      title="Aide"
      description=""
      buttonLabel="Choisis un motif"
      types={types(count)}
    />,
  );

describe('TicketPanelPreview', () => {
  it('montre un bouton par type jusqu’à 5 types', () => {
    show(5);
    expect(screen.getByText('🐛 Type 1')).toBeTruthy();
    expect(screen.getByText('Type 5')).toBeTruthy();
  });

  it('bascule en menu déroulant à partir de 6 types', () => {
    show(6);
    expect(screen.getByText('Choisis un motif')).toBeTruthy();
    expect(screen.queryByText('Type 1')).toBeNull();
    expect(screen.getByText('6 types de ticket')).toBeTruthy();
  });

  it('garde un bouton par défaut sans type', () => {
    show(0);
    expect(screen.getByText('🎫 Choisis un motif')).toBeTruthy();
  });
});
