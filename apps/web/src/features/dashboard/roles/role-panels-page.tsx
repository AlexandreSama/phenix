import { ROLE_PANEL_LIMITS } from '@phenix/shared';
import { useQueries } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { buttonClass } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { channelsQuery, rolePanelsQuery, useDeleteRolePanel } from '../api';
import { RolePanelCard } from './role-panel-card';

export function RolePanelsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const [panels, channels] = useQueries({
    queries: [rolePanelsQuery(guildId), channelsQuery(guildId)],
  });
  const remove = useDeleteRolePanel(guildId);
  const error = panels.error ?? channels.error;
  const full = (panels.data?.length ?? 0) >= ROLE_PANEL_LIMITS.panels;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-400">
          Des boutons pour que les membres prennent leurs rôles eux-mêmes.
        </p>
        <Link
          to="/dashboard/$guildId/roles/$panelId"
          params={{ guildId, panelId: 'nouveau' }}
          className={buttonClass('primary', full ? 'pointer-events-none opacity-50' : '')}
          aria-disabled={full}
        >
          Nouveau panel
        </Link>
      </div>
      {error && <p role="alert">{error.message}</p>}
      {!error && (!panels.data || !channels.data) && <p>Chargement…</p>}
      {panels.data?.length === 0 && (
        <Card className="text-center text-stone-300">
          Aucun panel pour l'instant. Crée le premier : il apparaîtra dans le salon choisi.
        </Card>
      )}
      {panels.data && channels.data && (
        <ul className="flex flex-col gap-3">
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
      )}
    </section>
  );
}
