import { FORUM_LIMITS } from '@phenix/shared';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { inputClass } from '../../components/ui/field';
import { previewForumMarkdown, uploadForumImage } from './api';

const MAX_MB = FORUM_LIMITS.imageMaxBytes / (1024 * 1024);
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** « capture [1].png » → « capture 1 » : le nom devient le texte alternatif de l'image. */
const altFrom = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[[\]]/g, '')
    .trim();

/** Les onglets Écrire / Aperçu. */
const tabClass = (active: boolean) =>
  `rounded-md px-2 py-1 text-xs font-semibold ${active ? 'bg-brown text-white' : 'text-stone-400 hover:text-white'}`;

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  rows?: number;
}

/**
 * La zone de saisie d'un message : du Markdown, un bouton pour ajouter une image, et un aperçu
 * rendu par l'API elle-même, donc identique au message publié.
 */
export function MarkdownEditor({ id, label, value, onChange, error, rows = 8 }: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Le dernier emplacement du curseur ; aucun tant que la personne n'a pas cliqué dans le texte */
  const caret = useRef<{ start: number; end: number } | null>(null);

  /** Insère du texte à l'endroit du curseur, ou à la fin, puis y replace le curseur. */
  const insert = (text: string) => {
    const { start, end } = caret.current ?? { start: value.length, end: value.length };
    onChange(value.slice(0, start) + text + value.slice(end));
    const after = start + text.length;
    caret.current = { start: after, end: after };
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(after, after);
    });
  };

  const upload = async (file: File) => {
    setProblem(null);
    if (file.size > FORUM_LIMITS.imageMaxBytes) {
      setProblem(`« ${file.name} » dépasse ${MAX_MB} Mo.`);
      return;
    }
    setUploading(true);
    try {
      const image = await uploadForumImage(file);
      insert(`\n![${altFrom(file.name)}](${image.url})\n`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Envoi impossible');
    } finally {
      setUploading(false);
    }
  };

  const showPreview = async () => {
    setTab('preview');
    setPreview(null);
    setProblem(null);
    if (value.trim() === '') return;
    try {
      setPreview((await previewForumMarkdown(value)).html);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Aperçu impossible');
    }
  };

  const message = error ?? problem;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-stone-100">
          {label}
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            className={tabClass(tab === 'write')}
            aria-pressed={tab === 'write'}
            onClick={() => setTab('write')}
          >
            Écrire
          </button>
          <button
            type="button"
            className={tabClass(tab === 'preview')}
            aria-pressed={tab === 'preview'}
            onClick={() => void showPreview()}
          >
            Aperçu
          </button>
        </div>
      </div>

      {tab === 'write' ? (
        <textarea
          id={id}
          ref={textarea}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onSelect={(event) => {
            const { selectionStart, selectionEnd } = event.currentTarget;
            caret.current = { start: selectionStart, end: selectionEnd };
          }}
          aria-invalid={message ? true : undefined}
          aria-describedby={`${id}-help`}
          className={`${inputClass} font-mono`}
        />
      ) : (
        <div
          aria-label="Aperçu du message"
          className="forum-content min-h-40 rounded-lg border border-brown p-3"
        >
          {value.trim() === '' && <p className="text-stone-500">Rien à afficher.</p>}
          {value.trim() !== '' && preview === null && !problem && <p>Chargement…</p>}
          {/* Le HTML vient de l'API, qui l'a rendu sans aucune balise tapée par le membre */}
          {preview !== null && <div dangerouslySetInnerHTML={{ __html: preview }} />}
        </div>
      )}

      <div
        id={`${id}-help`}
        className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Envoi…' : 'Ajouter une image'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            aria-label="Image à ajouter"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <span>**gras**, _italique_, [lien](https://…)</span>
        </div>
        <span
          className={`tabular-nums ${value.length > FORUM_LIMITS.contentMax ? 'text-flame' : ''}`}
        >
          {value.length}/{FORUM_LIMITS.contentMax}
        </span>
      </div>
      {message && (
        <p role="alert" className="text-xs text-flame">
          {message}
        </p>
      )}
    </div>
  );
}
