import { forumPostInputSchema, type ForumThreadView } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, buttonClass } from '../../components/ui/button';
import { NotFound } from '../../root-layout';
import { LOGIN_URL } from '../auth/api';
import {
  forumThreadQuery,
  useDeletePost,
  useDeleteThread,
  useEditPost,
  useModerateThread,
  useReply,
} from './api';
import { MarkdownEditor } from './markdown-editor';
import { PostItem } from './post-item';

const pageSearch = (page: number) => ({ page: page > 1 ? page : undefined });

/** La barre de la modération : épingler, verrouiller, supprimer le sujet. */
function ModerationBar({ thread, slug }: { thread: ForumThreadView; slug: string }) {
  const moderate = useModerateThread(thread.id);
  const remove = useDeleteThread(thread.id);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const failure = moderate.error ?? remove.error;

  return (
    <div
      role="group"
      aria-label="Modération"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-ember/60 p-3"
    >
      <span className="text-xs font-semibold text-stone-400 uppercase">Modération</span>
      <Button
        variant="ghost"
        onClick={() => moderate.mutate({ pinned: !thread.pinned })}
        disabled={moderate.isPending}
      >
        {thread.pinned ? 'Désépingler' : 'Épingler'}
      </Button>
      <Button
        variant="ghost"
        onClick={() => moderate.mutate({ locked: !thread.locked })}
        disabled={moderate.isPending}
      >
        {thread.locked ? 'Déverrouiller' : 'Verrouiller'}
      </Button>
      {!confirming ? (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Supprimer le sujet
        </Button>
      ) : (
        <>
          <span className="text-sm text-stone-300">Le sujet et tous ses messages ?</span>
          <Button
            onClick={async () => {
              await remove.mutateAsync();
              await navigate({ to: '/forum/$slug', params: { slug } });
            }}
            disabled={remove.isPending}
          >
            Oui, supprimer
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </>
      )}
      {failure && (
        <p role="alert" className="w-full text-xs text-flame">
          {failure.message}
        </p>
      )}
    </div>
  );
}

/** Répondre : le message part, puis la page affiche la réponse publiée. */
function ReplyForm({
  threadId,
  onPosted,
}: {
  threadId: number;
  onPosted: (page: number, postId: number) => Promise<void>;
}) {
  const reply = useReply(threadId);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      aria-label="Répondre"
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = forumPostInputSchema.safeParse({ content });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Message invalide');
          return;
        }
        setError(null);
        try {
          const created = await reply.mutateAsync(parsed.data.content);
          setContent('');
          await onPosted(created.page, created.postId);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Échec');
        }
      }}
    >
      <MarkdownEditor
        id="reply"
        label="Ta réponse"
        value={content}
        onChange={setContent}
        error={error ?? undefined}
      />
      <div>
        <Button type="submit" disabled={reply.isPending}>
          {reply.isPending ? 'Envoi…' : 'Répondre'}
        </Button>
      </div>
    </form>
  );
}

/** Un sujet : ses messages page par page, la modération, et le formulaire de réponse. */
export function ThreadPage() {
  const { slug, threadId } = useParams({ from: '/forum/$slug/$threadId' });
  const { page = 1 } = useSearch({ from: '/forum/$slug/$threadId' });
  const { hash } = useLocation();
  const navigate = useNavigate();
  const id = Number(threadId);
  const valid = Number.isInteger(id) && id > 0;
  const { data, error, isPlaceholderData } = useQuery({
    ...forumThreadQuery(id, page),
    enabled: valid,
  });
  const editPost = useEditPost();
  const deletePost = useDeletePost();

  // Après une réponse, l'adresse vise #message-123 : on y descend une fois la page chargée
  useEffect(() => {
    if (data && hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }, [data, hash]);

  if (!valid) return <NotFound />;
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p>Chargement…</p>;

  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Fil d’Ariane" className="text-sm text-stone-400">
        <Link to="/forum" className="hover:text-white">
          Forum
        </Link>{' '}
        ›{' '}
        <Link to="/forum/$slug" params={{ slug: data.category.slug }} className="hover:text-white">
          {data.category.name}
        </Link>
      </nav>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold break-words text-white">{data.title}</h1>
        <div className="flex gap-2">
          {data.pinned && (
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-ink">
              Épinglé
            </span>
          )}
          {data.locked && (
            <span className="rounded-full border border-stone-500 px-2 py-0.5 text-xs text-stone-400">
              Verrouillé
            </span>
          )}
        </div>
      </div>

      {data.canModerate && <ModerationBar thread={data} slug={data.category.slug} />}

      <div
        className={`flex flex-col gap-4 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}
      >
        {data.posts.map((post) => (
          <PostItem
            key={post.id}
            post={post}
            onSave={(content) => editPost.mutateAsync({ postId: post.id, content })}
            onDelete={() => deletePost.mutateAsync(post.id)}
          />
        ))}
      </div>

      {data.pageCount > 1 && (
        <nav aria-label="Pages du sujet" className="flex items-center justify-between gap-4">
          <Link
            to="/forum/$slug/$threadId"
            params={{ slug, threadId }}
            search={pageSearch(data.page - 1)}
            disabled={data.page <= 1}
            className={buttonClass('ghost', data.page <= 1 ? 'pointer-events-none opacity-40' : '')}
          >
            ← Précédente
          </Link>
          <span className="text-sm text-stone-400 tabular-nums">
            Page {data.page} / {data.pageCount}
          </span>
          <Link
            to="/forum/$slug/$threadId"
            params={{ slug, threadId }}
            search={pageSearch(data.page + 1)}
            disabled={data.page >= data.pageCount}
            className={buttonClass(
              'ghost',
              data.page >= data.pageCount ? 'pointer-events-none opacity-40' : '',
            )}
          >
            Suivante →
          </Link>
        </nav>
      )}

      {data.canReply ? (
        <ReplyForm
          threadId={data.id}
          onPosted={async (replyPage, postId) => {
            await navigate({
              to: '/forum/$slug/$threadId',
              params: { slug, threadId },
              search: pageSearch(replyPage),
              hash: `message-${postId}`,
            });
          }}
        />
      ) : data.locked ? (
        <p className="text-sm text-stone-400">
          Ce sujet est verrouillé : plus de réponse possible.
        </p>
      ) : (
        <a href={LOGIN_URL} className={buttonClass('ghost', 'self-start')}>
          Se connecter pour répondre
        </a>
      )}
    </section>
  );
}
