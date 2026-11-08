import { useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Card } from '../../../components/ui/card';
import { channelsQuery, configQuery, rolesQuery, useUpdateConfig } from '../api';
import { GeneralSettingsForm } from './general-settings-form';

export function GeneralSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const [config, channels, roles] = useQueries({
    queries: [configQuery(guildId), channelsQuery(guildId), rolesQuery(guildId)],
  });
  const update = useUpdateConfig(guildId);
  const error = config.error ?? channels.error ?? roles.error;

  return (
    <Card>
      {error && <p role="alert">{error.message}</p>}
      {!error && (!config.data || !channels.data || !roles.data) && <p>Chargement…</p>}
      {config.data && channels.data && roles.data && (
        <GeneralSettingsForm
          config={config.data}
          channels={channels.data}
          roles={roles.data}
          onSubmit={(values) => update.mutateAsync(values)}
        />
      )}
    </Card>
  );
}
