import { ROLE_PANEL_LIMITS } from '@phenix/shared';
import { useQueries } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/panel';
import { channelsQuery, rolePanelsQuery, useDeleteRolePanel } from '../api';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { RolePanelCard } from './role-panel-card';

export function RolePanelsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const queries = useQueries({
    queries: [rolePanelsQuery(guildId), channelsQuery(guildId)],
  });
  const [panels, channels] = queries;
  const remove = useDeleteRolePanel(guildId);
  const { error, retry } = firstFailure(queries);
  const count = panels.data?.length ?? 0;
  const full = count >= ROLE_PANEL_LIMITS.panels;

  const newPanel = (
    <Link
      to="/dashboard/$guildId/roles/$panelId"
      params={{ guildId, panelId: 'nouveau' }}
      className={buttonClass('primary', full ? 'pointer-events-none opacity-50' : '')}
      aria-disabled={full}
    >
      <Icon name="plus" className="size-4" />
      Nouveau panel
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Rôles en libre-service"
        description="Des messages à boutons : chaque membre prend ou retire ses rôles lui-même, sans passer par le staff."
        actions={count > 0 && newPanel}
      />
      {error && <LoadError error={error} onRetry={retry} />}
      {!error && (!panels.data || !channels.data) && (
        <PageSkeleton label="Chargement des panels…" panels={2} />
      )}
      {remove.error && (
        <p role="alert" className="text-sm text-flame">
          {remove.error.message}
        </p>
      )}
      {panels.data?.length === 0 && (
        <EmptyState icon="tag" title="Aucun panel pour l'instant" action={newPanel}>
          Crée le premier : le bot le publie dans le salon choisi, avec un bouton par rôle.
        </EmptyState>
      )}
      {panels.data && panels.data.length > 0 && channels.data && (
        <div className="flex flex-col gap-3">
          <ul aria-label="Panels de rôles" className="flex flex-col gap-3">
            {panels.data.map((panel) => (
              <li key={panel.id}>
                <RolePanelCard
                  guildId={guildId}
                  panel={panel}
                  channel={channels.data.find((channel) => channel.id === panel.channelId)}
                  onDelete={() => remove.mutateAsync(panel.id)}
                />
              </li>
            ))}
          </ul>
          <p className="text-sm text-stone-400">
            {count} / {ROLE_PANEL_LIMITS.panels} panels
            {full && ' : supprime-en un pour en créer un autre.'}
          </p>
        </div>
      )}
    </div>
  );
}
