import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { buttonClass } from '../../components/ui/button';
import { LOGIN_URL } from '../auth/api';
import { forumCategoryQuery, formatForumDate } from './api';
import { AuthorLine } from './author';

const pageSearch = (page: number) => ({ page: page > 1 ? page : undefined });

/** Les sujets d'une catégorie : épinglés d'abord, puis du plus actif au plus ancien. */
export function CategoryPage() {
  const { slug } = useParams({ from: '/forum/$slug/' });
  const { page = 1 } = useSearch({ from: '/forum/$slug/' });
  const { data, error, isPlaceholderData } = useQuery(forumCategoryQuery(slug, page));

  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p>Chargement…</p>;

  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Fil d’Ariane" className="text-sm text-stone-400">
        <Link to="/forum" className="hover:text-white">
          Forum
        </Link>{' '}
        › {data.category.name}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold text-white">{data.category.name}</h1>
          {data.category.description && (
            <p className="text-sm text-stone-400">{data.category.description}</p>
          )}
        </div>
        {data.canPost ? (
          <Link to="/forum/$slug/nouveau" params={{ slug }} className={buttonClass('primary')}>
            Nouveau sujet
          </Link>
        ) : (
          <a href={LOGIN_URL} className={buttonClass('ghost')}>
            Se connecter pour écrire
          </a>
        )}
      </div>

      {data.threads.length === 0 ? (
        <p className="text-sm text-stone-400">Aucun sujet pour l’instant : lance le premier !</p>
      ) : (
        <ul
          aria-label={`Sujets, page ${data.page}`}
          className={`flex flex-col divide-y divide-brown rounded-xl border border-brown transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {data.threads.map((thread) => (
            <li key={thread.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {thread.pinned && (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-ink">
                    Épinglé
                  </span>
                )}
                {thread.locked && (
                  <span className="rounded-full border border-stone-500 px-2 py-0.5 text-xs text-stone-400">
                    Verrouillé
                  </span>
                )}
                <Link
                  to="/forum/$slug/$threadId"
                  params={{ slug, threadId: String(thread.id) }}
                  className="min-w-0 font-semibold break-words text-white hover:text-gold"
                >
                  {thread.title}
                </Link>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
                <AuthorLine author={thread.author} size="size-5" />
                <span>
                  {thread.replyCount} réponse{thread.replyCount > 1 ? 's' : ''} ·{' '}
                  {formatForumDate(thread.lastActivityAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.pageCount > 1 && (
        <nav aria-label="Pages des sujets" className="flex items-center justify-between gap-4">
          <Link
            to="/forum/$slug"
            params={{ slug }}
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
            to="/forum/$slug"
            params={{ slug }}
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
    </section>
  );
}
