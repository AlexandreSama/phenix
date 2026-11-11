import type { GuildMemberResult } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader, Panel } from '../../../components/ui/panel';
import { delegatesQuery, useSaveDelegate } from '../api';
import { LoadError } from '../query-state';
import { DelegateEditor } from './delegate-editor';
import { DelegateRow } from './delegate-row';
import { MemberSearch } from './member-search';

/**
 * L'onglet Accès : un administrateur ouvre certains onglets à un membre, sans lui donner
 * « Gérer le serveur » sur Discord. Seuls les administrateurs le voient (guild-tabs.ts).
 */
export function AccessPage({ searchDelay }: { searchDelay?: number } = {}) {
  const { guildId } = useParams({ from: '/dashboard/$guildId/acces' });
  const delegates = useQuery(delegatesQuery(guildId));
  const save = useSaveDelegate(guildId);
  const [picked, setPicked] = useState<GuildMemberResult | null>(null);
  const [granted, setGranted] = useState<string | null>(null);
  const list = delegates.data ?? [];
  const existing = picked && list.find((delegate) => delegate.userId === picked.id);
  const pickedName = picked ? (picked.displayName ?? picked.username) : '';

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Accès"
        description="Ouvre certains onglets de ce tableau de bord à un membre du serveur : il règle The Division 2 sans toucher aux tickets, par exemple. Sur Discord, ses droits ne changent pas."
      />

      <Panel
        icon="plus"
        title="Donner un accès"
        description="Le membre retrouve le serveur dans « Tes serveurs », avec les seuls onglets cochés."
      >
        {picked ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <img src={picked.avatarUrl} alt="" className="size-10 rounded-full" />
              <div className="flex min-w-0 flex-col">
                <p className="truncate font-semibold text-white">{pickedName}</p>
                <p className="truncate text-[13px] text-stone-400">@{picked.username}</p>
              </div>
            </div>
            <DelegateEditor
              key={picked.id}
              name={pickedName}
              initial={existing?.modules ?? []}
              submitLabel={existing ? 'Enregistrer' : 'Donner l’accès'}
              onSubmit={async (modules) => {
                await save.mutateAsync({ userId: picked.id, modules });
                setGranted(pickedName);
                setPicked(null);
              }}
              onCancel={() => setPicked(null)}
            />
          </div>
        ) : (
          <>
            {granted && (
              <p role="status" className="text-sm text-gold">
                Accès enregistré pour {granted}.
              </p>
            )}
            <MemberSearch
              guildId={guildId}
              delegates={list}
              delay={searchDelay}
              onPick={(member) => {
                setGranted(null);
                setPicked(member);
              }}
            />
          </>
        )}
      </Panel>

      <Panel
        icon="users"
        title="Membres avec un accès"
        description="Ils ne voient ni cet onglet, ni ne peuvent déléguer à leur tour. S’ils quittent le serveur, leur accès ne compte plus."
        aside={
          list.length > 0 && (
            <span className="text-sm text-stone-400 tabular-nums">
              {list.length} membre{list.length > 1 ? 's' : ''}
            </span>
          )
        }
        flush
      >
        {delegates.error && (
          <div className="p-5 sm:p-6">
            <LoadError error={delegates.error} onRetry={() => void delegates.refetch()} />
          </div>
        )}
        {!delegates.error && !delegates.data && (
          <p role="status" className="p-6 text-sm text-stone-400">
            Chargement des accès…
          </p>
        )}
        {delegates.data && list.length === 0 && (
          <div className="p-5 sm:p-6">
            <EmptyState icon="users" title="Personne n’a d’accès délégué">
              Cherche un membre ci-dessus, coche les onglets à lui ouvrir : il les retrouvera sur le
              site en se connectant avec Discord.
            </EmptyState>
          </div>
        )}
        {list.length > 0 && (
          <ul aria-label="Membres avec un accès" className="flex flex-col divide-y divide-white/6">
            {list.map((delegate) => (
              <DelegateRow key={delegate.userId} guildId={guildId} delegate={delegate} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
