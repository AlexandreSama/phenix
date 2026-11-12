import { useQuery, useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { PageHeader } from '../../../components/ui/panel';
import { channelsQuery, guildsQuery, rolesQuery, useUpdateWelcome, welcomeQuery } from '../api';
import { canOpen } from '../guild-tabs';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { WelcomeSettingsForm } from './welcome-settings-form';

export function WelcomeSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const queries = useQueries({
    queries: [welcomeQuery(guildId), channelsQuery(guildId), rolesQuery(guildId)],
  });
  const [config, channels, roles] = queries;
  // Déjà chargée par la navigation : dit si l'utilisateur est administrateur ou a l'onglet Rôles
  const guild = useQuery(guildsQuery).data?.find((entry) => entry.id === guildId);
  const update = useUpdateWelcome(guildId);
  const { error, retry } = firstFailure(queries);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Bienvenue"
        description="Accueille les nouveaux membres, leur donne un rôle, et prévient quand quelqu’un part."
      />
      {error && <LoadError error={error} onRetry={retry} />}
      {!error && (!config.data || !channels.data || !roles.data || !guild) && (
        <PageSkeleton label="Chargement des réglages…" panels={2} />
      )}
      {config.data && channels.data && roles.data && guild && (
        <WelcomeSettingsForm
          config={config.data}
          channels={channels.data}
          roles={roles.data}
          canChooseRole={canOpen(guild, 'ROLES')}
          onSubmit={(values) => update.mutateAsync(values)}
        />
      )}
    </div>
  );
}
