import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Card } from '../../../components/ui/card';
import { channelsQuery, configQuery, guildsQuery, rolesQuery, useUpdateConfig } from '../api';
import { GeneralSettingsForm } from './general-settings-form';

export function GeneralSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const { data: guilds } = useQuery(guildsQuery);
  const [config, channels, roles] = useQueries({
    queries: [configQuery(guildId), channelsQuery(guildId), rolesQuery(guildId)],
  });
  const update = useUpdateConfig(guildId);
  const guild = guilds?.find((entry) => entry.id === guildId);
  const error = config.error ?? channels.error ?? roles.error;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/dashboard" className="text-sm text-stone-400 hover:text-white">
          ← Tes serveurs
        </Link>
        <h1 className="text-2xl font-bold text-white">{guild?.name ?? 'Serveur'} · Général</h1>
      </div>
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
    </section>
  );
}
