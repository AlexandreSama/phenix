import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { forumCategoriesQuery, formatForumDate } from './api';

/** L'accueil du forum : ses catégories, dans l'ordre choisi par l'administration. */
export function ForumHomePage() {
  const { data: categories, error } = useQuery(forumCategoriesQuery);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Forum</h1>
        <p className="text-sm text-stone-400">
          Ouvert à tous en lecture. Connecte-toi avec Discord pour écrire.
        </p>
      </div>

      {error && <p role="alert">{error.message}</p>}
      {!error && !categories && <p>Chargement…</p>}
      {categories?.length === 0 && (
        <p className="text-sm text-stone-400">Le forum n’a pas encore de catégorie.</p>
      )}
      {categories && categories.length > 0 && (
        <ul aria-label="Catégories" className="flex flex-col gap-3">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                to="/forum/$slug"
                params={{ slug: category.slug }}
                className="flex flex-col gap-1 rounded-xl border border-brown bg-brown/20 p-4 hover:border-ember sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-semibold text-white">{category.name}</span>
                  {category.description && (
                    <span className="text-sm text-stone-400">{category.description}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-stone-400 sm:text-right">
                  {category.threadCount} sujet{category.threadCount > 1 ? 's' : ''}
                  {category.lastActivityAt && (
                    <>
                      <br className="hidden sm:inline" />
                      <span className="sm:hidden"> · </span>
                      {formatForumDate(category.lastActivityAt)}
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
