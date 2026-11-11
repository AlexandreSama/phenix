import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewThreadForm } from './new-thread-page';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  uploadForumImage: vi.fn(),
  previewForumMarkdown: vi.fn(),
}));

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<NewThreadForm categoryId={2} onSubmit={onSubmit} />);
  return onSubmit;
}

const publish = () => fireEvent.click(screen.getByRole('button', { name: 'Publier le sujet' }));

describe('NewThreadForm', () => {
  it('envoie la catégorie, le titre et le message rognés', async () => {
    const onSubmit = setup();

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: '  Build tank  ' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Quel set ?' } });
    publish();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        categoryId: 2,
        title: 'Build tank',
        content: 'Quel set ?',
      }),
    );
  });

  it('explique ce qui manque, champ par champ', async () => {
    const onSubmit = setup();

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'ok' } });
    publish();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Un titre de 3 caractères au moins',
      'Écris quelque chose',
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('affiche le refus de l’API', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Tu as ouvert 5 sujets dans l’heure')));

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Un sujet' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Contenu' } });
    publish();

    expect((await screen.findByRole('alert')).textContent).toContain('5 sujets dans l’heure');
  });
});
