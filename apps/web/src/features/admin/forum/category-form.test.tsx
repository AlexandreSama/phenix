import type { ForumCategorySummary } from '@phenix/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryForm } from './category-form';

const category: ForumCategorySummary = {
  id: 2,
  slug: 'entraide',
  name: 'Entraide',
  description: null,
  position: 0,
  threadCount: 3,
  lastActivityAt: null,
};

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('CategoryForm', () => {
  it('ajoute une catégorie : adresse en minuscules, description vide envoyée comme null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CategoryForm nextPosition={4} onSubmit={onSubmit} />);

    fireEvent.change(field('Nom'), { target: { value: 'The Division 2' } });
    fireEvent.change(field('Adresse'), { target: { value: 'The-Division-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la catégorie' }));

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        slug: 'the-division-2',
        name: 'The Division 2',
        description: null,
        position: 4,
      }),
    );
  });

  it('refuse une adresse avec des espaces', async () => {
    render(<CategoryForm onSubmit={vi.fn()} />);

    fireEvent.change(field('Nom'), { target: { value: 'Aide' } });
    fireEvent.change(field('Adresse'), { target: { value: 'aide ici' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la catégorie' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Minuscules, chiffres et tirets : « the-division-2 »',
    );
  });

  it('une catégorie qui a des sujets ne se supprime pas', () => {
    render(<CategoryForm category={category} onSubmit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Supprimer' })).toHaveProperty('disabled', true);
    expect(screen.getByText('3 sujets')).toBeTruthy();
  });
});
