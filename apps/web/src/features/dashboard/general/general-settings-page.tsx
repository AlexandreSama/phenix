import { useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { PageHeader } from '../../../components/ui/panel';
import { channelsQuery, configQuery, rolesQuery, useUpdateConfig } from '../api';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { GeneralSettingsForm } from './general-settings-form';

export function GeneralSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const queries = useQueries({
    queries: [configQuery(guildId), channelsQuery(guildId), rolesQuery(guildId)],
  });
  const [config, channels, roles] = queries;
  const update = useUpdateConfig(guildId);
  const { error, retry } = firstFailure(queries);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Général"
        description="Les réglages de base du bot sur ce serveur : où il écrit, qui fait partie du staff, à quelle heure il vit."
      />
      {error && <LoadError error={error} onRetry={retry} />}
      {!error && (!config.data || !channels.data || !roles.data) && (
        <PageSkeleton label="Chargement des réglages…" panels={3} />
      )}
      {config.data && channels.data && roles.data && (
        <GeneralSettingsForm
          config={config.data}
          channels={channels.data}
          roles={roles.data}
          onSubmit={(values) => update.mutateAsync(values)}
        />
      )}
    </div>
  );
}
