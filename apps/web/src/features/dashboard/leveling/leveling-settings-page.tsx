import { useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Card } from '../../../components/ui/card';
import { channelsQuery, levelingQuery, useUpdateLeveling } from '../api';
import { LevelingSettingsForm } from './leveling-settings-form';

export function LevelingSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const [config, channels] = useQueries({
    queries: [levelingQuery(guildId), channelsQuery(guildId)],
  });
  const update = useUpdateLeveling(guildId);
  const error = config.error ?? channels.error;

  return (
    <Card>
      {error && <p role="alert">{error.message}</p>}
      {!error && (!config.data || !channels.data) && <p>Chargement…</p>}
      {config.data && channels.data && (
        <LevelingSettingsForm
          guildId={guildId}
          config={config.data}
          channels={channels.data}
          onSubmit={(values) => update.mutateAsync(values)}
        />
      )}
    </Card>
  );
}
