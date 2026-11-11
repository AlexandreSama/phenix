import { useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Card } from '../../../components/ui/card';
import {
  channelsQuery,
  rolesQuery,
  td2EventsQuery,
  td2SettingsQuery,
  useSaveTd2Settings,
} from '../api';
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
  const error = settings.error ?? channels.error ?? roles.error;

  return (
    <section className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-white">Réglages</h2>
        {error && <p role="alert">{error.message}</p>}
        {!error && (!settings.data || !channels.data || !roles.data) && <p>Chargement…</p>}
        {settings.data && channels.data && roles.data && (
          <Td2SettingsForm
            settings={settings.data}
            channels={channels.data}
            roles={roles.data}
            onSubmit={(input) => save.mutateAsync(input)}
          />
        )}
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold text-white">Sorties à venir</h2>
        {events.error && <p role="alert">{events.error.message}</p>}
        {!events.error && !events.data && <p>Chargement…</p>}
        {events.data && <Td2EventList events={events.data} channels={channels.data ?? []} />}
      </Card>
    </section>
  );
}
