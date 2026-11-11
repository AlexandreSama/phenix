import { useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { PageHeader, Panel } from '../../../components/ui/panel';
import {
  channelsQuery,
  rolesQuery,
  td2EventsQuery,
  td2SettingsQuery,
  useSaveTd2Settings,
} from '../api';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { Td2EventList } from './td2-event-list';
import { Td2SettingsForm } from './td2-settings-form';

export function Td2Page() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/td2' });
  const [settings, channels, roles, events] = useQueries({
    queries: [
      td2SettingsQuery(guildId),
      channelsQuery(guildId),
      rolesQuery(guildId),
      td2EventsQuery(guildId),
    ],
  });
  const save = useSaveTd2Settings(guildId);
  const { error, retry } = firstFailure([settings, channels, roles]);
  const upcoming = events.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="The Division 2"
        description="Raids et incursions organisés sur Discord avec /td2, et signalements de joueurs partagés entre les serveurs du bot."
      />

      <Panel
        icon="crosshair"
        title="Sorties à venir"
        description="On s'inscrit sur Discord ; ici, tu suis le remplissage. La liste se met à jour toute seule."
        aside={
          upcoming > 0 && (
            <span className="text-sm text-stone-400 tabular-nums">
              {upcoming} {upcoming > 1 ? 'sorties' : 'sortie'}
            </span>
          )
        }
        flush
      >
        {events.error && (
          <div className="p-5 sm:p-6">
            <LoadError error={events.error} onRetry={() => void events.refetch()} />
          </div>
        )}
        {!events.error && !events.data && (
          <p role="status" className="p-6 text-sm text-stone-400">
            Chargement des sorties…
          </p>
        )}
        {events.data && <Td2EventList events={events.data} channels={channels.data ?? []} />}
      </Panel>

      {error && <LoadError error={error} onRetry={retry} />}
      {!error && (!settings.data || !channels.data || !roles.data) && (
        <PageSkeleton label="Chargement des réglages…" panels={2} />
      )}
      {settings.data && channels.data && roles.data && (
        <Td2SettingsForm
          settings={settings.data}
          channels={channels.data}
          roles={roles.data}
          onSubmit={(input) => save.mutateAsync(input)}
        />
      )}
    </div>
  );
}
