import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { guildsQuery } from '../api';
import { GuildList, SEARCH_THRESHOLD } from './guild-list';

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative w-full sm:w-72">
      <label htmlFor="guild-search" className="sr-only">
        Rechercher un serveur
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-stone-400"
      />
      <input
        id="guild-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Rechercher un serveur"
        autoComplete="off"
        // La croix native (bleue dans Chrome) laisse la place à la nôtre, aux couleurs du site
        className="min-h-11 w-full rounded-xl border border-white/12 bg-surface py-2 pr-11 pl-10 text-[15px] text-stone-100 placeholder:text-stone-400 focus:border-flame/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 hover:text-white focus-visible:outline-2 focus-visible:outline-gold"
        >
          <Icon name="close" className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Des cartes grises à la place des serveurs, le temps que Discord réponde. */
function GuildListSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Chargement de tes serveurs…</span>
      <span
        aria-hidden="true"
        className="h-6 w-40 rounded-md bg-white/6 motion-safe:animate-pulse"
      />
      <ul aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <li
            key={index}
            className="flex items-center gap-4 rounded-2xl border border-white/6 bg-surface p-4"
          >
            <span className="size-12 shrink-0 rounded-full bg-white/8 motion-safe:animate-pulse" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-4 w-2/3 rounded bg-white/8 motion-safe:animate-pulse" />
              <span className="h-3 w-1/3 rounded bg-white/6 motion-safe:animate-pulse" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RefreshButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <Button variant="ghost" onClick={onClick} disabled={busy} className="min-h-11">
      <Icon name="refresh" className={`size-4 ${busy ? 'motion-safe:animate-spin' : ''}`} />
      {busy ? 'Actualisation…' : 'Actualiser'}
    </Button>
  );
}

export function GuildPickerPage() {
  const {
    data: guilds,
    error,
    refetch,
    isFetching,
  } = useQuery({
    ...guildsQuery,
    // De retour de l'onglet d'invitation : la liste se recharge, le serveur change de groupe
    refetchOnWindowFocus: 'always',
  });
  const [search, setSearch] = useState('');
  const retry = () => void refetch();

  return (
    <section aria-labelledby="choix-serveur" className="flex flex-col gap-10 py-2 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-xl flex-col gap-3">
          <p className="text-sm font-semibold tracking-widest text-flame uppercase">
            Tableau de bord
          </p>
          <h1
            id="choix-serveur"
            className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl"
          >
            Choisis un serveur
          </h1>
          <p className="text-stone-300">
            Les serveurs où tu as la permission «&nbsp;Gérer le serveur&nbsp;». Ouvre-en un pour
            régler le bot.
          </p>
        </div>
        {guilds && guilds.length >= SEARCH_THRESHOLD && (
          <SearchField value={search} onChange={setSearch} />
        )}
      </header>

      {guilds && guilds.length > 0 && <GuildList guilds={guilds} search={search} />}

      {guilds?.length === 0 && (
        <div className="flex flex-col items-center gap-5 rounded-3xl border border-white/8 bg-surface px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-flame/15 text-flame">
            <Icon name="server" className="size-7" />
          </span>
          <h2 className="font-display text-2xl font-semibold text-white">Aucun serveur à gérer</h2>
          <p className="max-w-md text-stone-300">
            Il te faut la permission «&nbsp;Gérer le serveur&nbsp;» sur un serveur Discord pour le
            configurer ici. Crée ton serveur ou demande cette permission à son propriétaire, puis
            reviens sur cette page.
          </p>
          <RefreshButton onClick={retry} busy={isFetching} />
        </div>
      )}

      {/* Une erreur sans liste à montrer ; un rechargement raté garde la liste déjà affichée */}
      {!guilds && error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ember/60 bg-ember/10 p-5"
        >
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-white">Impossible de récupérer tes serveurs</p>
            <p className="text-sm text-stone-300">{error.message}</p>
          </div>
          <RefreshButton onClick={retry} busy={isFetching} />
        </div>
      )}

      {!guilds && !error && <GuildListSkeleton />}
    </section>
  );
}
