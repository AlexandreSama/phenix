import { forumPostInputSchema, type ForumPostView } from '@phenix/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { formatForumDate } from './api';
import { AuthorLine } from './author';
import { MarkdownEditor } from './markdown-editor';

interface Props {
  post: ForumPostView;
  onSave: (content: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}

/** Un message : son auteur, son contenu rendu par l'API, et ce que la personne peut en faire. */
export function PostItem({ post, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, after: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      after();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const parsed = forumPostInputSchema.safeParse({ content: draft });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Message invalide');
      return;
    }
    void run(
      () => onSave(parsed.data.content),
      () => setEditing(false),
    );
  };

  return (
    <article
      id={`message-${post.id}`}
      aria-label={`Message de ${post.author.username}`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-brown bg-brown/20 p-4 target:border-gold"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <AuthorLine author={post.author} />
        <span className="text-xs text-stone-400">
          <time dateTime={post.createdAt}>{formatForumDate(post.createdAt)}</time>
          {post.editedAt && (
            <span title={`Modifié le ${formatForumDate(post.editedAt)}`}> · modifié</span>
          )}
        </span>
      </header>

      {editing ? (
        <div className="flex flex-col gap-3">
          <MarkdownEditor
            id={`edit-${post.id}`}
            label="Modifier le message"
            value={draft}
            onChange={setDraft}
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              Enregistrer
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(post.content);
                setError(null);
              }}
              disabled={busy}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        // Le HTML vient de l'API, qui l'a rendu sans aucune balise tapée par le membre
        <div className="forum-content" dangerouslySetInnerHTML={{ __html: post.html }} />
      )}

      {!editing && (post.canEdit || post.canDelete) && (
        <footer className="flex flex-wrap items-center gap-2">
          {post.canEdit && (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Modifier
            </Button>
          )}
          {post.canDelete && !confirming && (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Supprimer
            </Button>
          )}
          {post.canDelete && confirming && (
            <>
              <span className="text-sm text-stone-300">Supprimer ce message ?</span>
              <Button
                onClick={() => void run(onDelete, () => setConfirming(false))}
                disabled={busy}
              >
                Oui, supprimer
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Annuler
              </Button>
            </>
          )}
        </footer>
      )}
      {error && (
        <p role="alert" className="text-xs text-flame">
          {error}
        </p>
      )}
    </article>
  );
}
