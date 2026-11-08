import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { GuildIcon } from '../../components/guild-icon';
import { buttonClass } from '../../components/ui/button';
import { ApiError } from '../../lib/api';
import { leaderboardQuery } from './api';
import { LeaderboardRow } from './leaderboard-row';

/** Page 1 : pas de ?page= dans l'URL, elle reste propre à partager. */
const pageSearch = (target: number) => ({ page: target > 1 ? target : undefined });

/** Classement public d'un serveur : la page que les membres partagent. */
export function LeaderboardPage() {
  const { guildId } = useParams({ from: '/classement/$guildId' });
  const { page = 1 } = useSearch({ from: '/classement/$guildId' });
  const { data, error, isPending, isPlaceholderData } = useQuery(leaderboardQuery(guildId, page));

  useEffect(() => {
    if (data) document.title = `Classement de ${data.guild.name} · PhenixMG`;
  }, [data]);

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <section className="py-20 text-center">
        <h1 className="text-2xl font-bold text-white">
          {notFound ? 'Classement introuvable' : 'Classement indisponible'}
        </h1>
        <p className="mt-2 text-stone-400">
          {notFound ? "Ce classement n'existe pas ou n'est pas public." : error.message}
        </p>
      </section>
    );
  }
  if (isPending) return <p>Chargement…</p>;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center gap-4">
        <GuildIcon
          name={data.guild.name}
          iconUrl={data.guild.iconUrl}
          className="size-16 text-xl ring-2 ring-flame ring-offset-4 ring-offset-ink"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-flame uppercase">Classement</p>
          <h1 className="truncate text-3xl font-bold text-white">{data.guild.name}</h1>
          <p className="text-sm text-stone-400">
            {data.totalMembers.toLocaleString('fr-FR')} membres classés
          </p>
        </div>
      </header>

      {data.entries.length === 0 ? (
        <p className="rounded-xl border border-brown p-6 text-center text-stone-300">
          Personne n'a encore gagné d'XP sur ce serveur.
        </p>
      ) : (
        <ol
          aria-label={`Classement, page ${data.page}`}
          className={`flex flex-col gap-2 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {data.entries.map((entry) => (
            <LeaderboardRow key={entry.userId} entry={entry} />
          ))}
        </ol>
      )}

      {data.pageCount > 1 && (
        <nav aria-label="Pages du classement" className="flex items-center justify-between gap-4">
          <Link
            to="/classement/$guildId"
            params={{ guildId }}
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
            to="/classement/$guildId"
            params={{ guildId }}
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
