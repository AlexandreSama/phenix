import { useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { PageHeader } from '../../../components/ui/panel';
import {
  categoriesQuery,
  channelsQuery,
  forumChannelsQuery,
  levelingQuery,
  useUpdateLeveling,
  voiceChannelsQuery,
} from '../api';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { LevelingSettingsForm } from './leveling-settings-form';

export function LevelingSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId' });
  const queries = useQueries({
    queries: [
      levelingQuery(guildId),
      channelsQuery(guildId),
      voiceChannelsQuery(guildId),
      forumChannelsQuery(guildId),
      categoriesQuery(guildId),
    ],
  });
  const [config, channels, voiceChannels, forumChannels, categories] = queries;
  const update = useUpdateLeveling(guildId);
  const { error, retry } = firstFailure(queries);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Niveaux"
        description="Les membres gagnent de l'XP en discutant et montent de niveau. Règle le rythme, les annonces et le classement."
      />
      {error && <LoadError error={error} onRetry={retry} />}
      {!error &&
        (!config.data ||
          !channels.data ||
          !voiceChannels.data ||
          !forumChannels.data ||
          !categories.data) && <PageSkeleton label="Chargement des réglages…" panels={3} />}
      {config.data &&
        channels.data &&
        voiceChannels.data &&
        forumChannels.data &&
        categories.data && (
          <LevelingSettingsForm
            guildId={guildId}
            config={config.data}
            channels={channels.data}
            voiceChannels={voiceChannels.data}
            forumChannels={forumChannels.data}
            categories={categories.data}
            onSubmit={(values) => update.mutateAsync(values)}
          />
        )}
    </div>
  );
}
