import type { ForumPostView } from '@phenix/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostItem } from './post-item';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  uploadForumImage: vi.fn(),
  previewForumMarkdown: vi.fn(),
}));

const post: ForumPostView = {
  id: 101,
  author: { id: '7', username: 'Faye', avatarUrl: '/avatar.png', role: 'MODERATOR' },
  content: 'Le **Foundry**',
  html: '<p>Le <strong>Foundry</strong></p>\n',
  createdAt: '2026-11-10T13:00:00.000Z',
  editedAt: '2026-11-10T14:00:00.000Z',
  canEdit: true,
  canDelete: true,
};

function setup(overrides: Partial<ForumPostView> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<PostItem post={{ ...post, ...overrides }} onSave={onSave} onDelete={onDelete} />);
  return { onSave, onDelete, article: screen.getByRole('article') };
}

describe('PostItem', () => {
  it('affiche le HTML de l’API, l’auteur, son rôle et la mention « modifié »', () => {
    const { article } = setup();

    expect(article.querySelector('strong')?.textContent).toBe('Foundry');
    expect(article.textContent).toContain('Faye');
    expect(article.textContent).toContain('Modérateur');
    expect(article.textContent).toContain('modifié');
    expect(article.id).toBe('message-101');
  });

  it('modifie le message en place', async () => {
    const { onSave } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Modifier le message'), {
      target: { value: '  Le Foundry, ou le Hunter’s Fury  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith('Le Foundry, ou le Hunter’s Fury'));
    await vi.waitFor(() => expect(screen.queryByLabelText('Modifier le message')).toBeNull());
  });

  it('refuse un message vidé, sans appeler l’API', () => {
    const { onSave } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Modifier le message'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByRole('alert').textContent).toBe('Écris quelque chose');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('supprime en deux clics', async () => {
    const { onDelete } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }));

    await vi.waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('sans droit, aucun bouton', () => {
    setup({ canEdit: false, canDelete: false });

    expect(screen.queryByRole('button')).toBeNull();
  });
});
