import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './markdown-editor';

const forumApi = vi.hoisted(() => ({
  uploadForumImage: vi.fn(),
  previewForumMarkdown: vi.fn(),
}));
vi.mock('./api', () => forumApi);

const IMAGE_ID = '123e4567-e89b-12d3-a456-426614174000';

/** L'éditeur avec son état, comme dans un vrai formulaire. */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MarkdownEditor id="message" label="Message" value={value} onChange={setValue} />;
}

const textarea = () => screen.getByLabelText('Message') as HTMLTextAreaElement;
const pick = (file: File) =>
  fireEvent.change(screen.getByLabelText('Image à ajouter'), { target: { files: [file] } });

beforeEach(() => {
  forumApi.uploadForumImage.mockReset();
  forumApi.previewForumMarkdown.mockReset();
});

describe('MarkdownEditor', () => {
  it('envoie l’image choisie et insère son Markdown dans le message', async () => {
    forumApi.uploadForumImage.mockResolvedValue({
      id: IMAGE_ID,
      url: `/api/media/${IMAGE_ID}`,
      width: 800,
      height: 600,
    });
    render(<Harness initial="Mon build :" />);

    pick(new File(['png'], 'build [tank].png', { type: 'image/png' }));

    await vi.waitFor(() =>
      expect(textarea().value).toBe(`Mon build :\n![build tank](/api/media/${IMAGE_ID})\n`),
    );
  });

  it('refuse une image trop lourde avant de l’envoyer', () => {
    render(<Harness />);
    const heavy = new File(['x'], 'enorme.png', { type: 'image/png' });
    Object.defineProperty(heavy, 'size', { value: 9 * 1024 * 1024 });

    pick(heavy);

    expect(screen.getByRole('alert').textContent).toBe('« enorme.png » dépasse 8 Mo.');
    expect(forumApi.uploadForumImage).not.toHaveBeenCalled();
  });

  it('affiche le refus de l’API', async () => {
    forumApi.uploadForumImage.mockRejectedValue(
      new Error('Formats acceptés : PNG, JPEG, WebP et GIF.'),
    );
    render(<Harness />);

    pick(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Formats acceptés');
  });

  it('l’aperçu montre le rendu de l’API, et n’appelle rien pour un message vide', async () => {
    forumApi.previewForumMarkdown.mockResolvedValue({ html: '<p><strong>gras</strong></p>' });
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    expect(screen.getByText('Rien à afficher.')).toBeTruthy();
    expect(forumApi.previewForumMarkdown).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Écrire' }));
    fireEvent.change(textarea(), { target: { value: '**gras**' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));

    const preview = await screen.findByLabelText('Aperçu du message');
    await vi.waitFor(() => expect(preview.querySelector('strong')?.textContent).toBe('gras'));
    expect(forumApi.previewForumMarkdown).toHaveBeenCalledWith('**gras**');
  });
});
