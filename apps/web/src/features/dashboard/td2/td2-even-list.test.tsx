import type { Td2EventSummary } from '@phenix/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { eventName, Td2EventList } from './td2-event-list';

const CHANNEL = '400000000000000001';
const raid: Td2EventSummary = {
  id: 12,
  kind: 'RAID',
  activity: 'Dark Hours',
  mode: 'Normal',
  scheduledAt: '2026-11-14T20:00:00.000Z',
  channelId: CHANNEL,
  confirmed: 8,
  capacity: 8,
  reserve: 2,
};

describe('Td2EventList', () => {
  it('nomme la sortie comme sur Discord : le mode seulement pour un raid', () => {
    expect(eventName(raid)).toBe('Raid Dark Hours · Normal');
    expect(eventName({ kind: 'INCURSION', activity: 'Broken Rain', mode: 'Standard' })).toBe(
      'Incursion Broken Rain',
    );
  });

  it('montre le remplissage, la réserve et le salon', () => {
    render(
      <Td2EventList
        events={[raid]}
        channels={[{ id: CHANNEL, name: 'raids', parentName: null }]}
      />,
    );

    const item = screen.getByRole('listitem');
    expect(item.textContent).toContain('Raid Dark Hours · Normal');
    expect(item.textContent).toContain('8/8 joueurs · 2 en réserve');
    expect(item.textContent).toContain('#raids');
  });

  it('sans sortie, explique comment en créer une', () => {
    render(<Td2EventList events={[]} channels={[]} />);

    expect(screen.getByText(/Aucune sortie prévue/)).toBeTruthy();
  });
});
