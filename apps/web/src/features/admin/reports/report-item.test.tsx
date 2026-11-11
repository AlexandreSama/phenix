import type { Td2ReportAdminSummary } from '@phenix/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportItem } from './report-item';

const report: Td2ReportAdminSummary = {
  id: 7,
  guildId: '300000000000000001',
  guildName: 'Les Agents',
  playerName: 'Agent47',
  platform: 'PSN',
  reason: 'CHEAT',
  details: 'Tir à travers les murs',
  status: 'CONFIRMED',
  evidenceCount: 2,
  createdAt: '2026-11-10T12:00:00.000Z',
  reviewedAt: '2026-11-10T13:00:00.000Z',
};

function setup(onDelete = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ul>
      <ReportItem report={report} onDelete={onDelete} />
    </ul>,
  );
  return onDelete;
}

describe('ReportItem', () => {
  it('montre le joueur, le motif, le serveur et le statut', () => {
    setup();
    const item = screen.getByRole('listitem');

    expect(item.textContent).toContain('Agent47');
    expect(item.textContent).toContain('PlayStation');
    expect(item.textContent).toContain('Triche · Les Agents');
    expect(item.textContent).toContain('Confirmé');
  });

  it('chaque capture est une miniature qui s’ouvre en grand, servie par l’API', () => {
    setup();

    const images = screen.getAllByRole('img');
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/api/admin/td2/reports/7/evidence/0',
      '/api/admin/td2/reports/7/evidence/1',
    ]);
    expect(screen.getAllByRole('link')[0]?.getAttribute('target')).toBe('_blank');
  });

  it('supprime en deux clics, et peut s’annuler', async () => {
    const onDelete = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }));
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledWith(7));
  });

  it('une suppression refusée est expliquée', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Signalement introuvable')));

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Signalement introuvable');
  });
});
