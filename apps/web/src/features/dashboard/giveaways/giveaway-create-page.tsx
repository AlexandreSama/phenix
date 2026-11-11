import { useQueries } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { PageHeader } from '../../../components/ui/panel';
import { channelsQuery, rolesQuery, useCreateGiveaway } from '../api';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { GiveawayForm } from './giveaway-form';

export function GiveawayCreatePage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/giveaways/nouveau' });
  const navigate = useNavigate();
  const queries = useQueries({
    queries: [channelsQuery(guildId), rolesQuery(guildId)],
  });
  const [channels, roles] = queries;
  const create = useCreateGiveaway(guildId);
  const { error, retry } = firstFailure(queries);
  const backToList = () => navigate({ to: '/dashboard/$guildId/giveaways', params: { guildId } });

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/dashboard/$guildId/giveaways"
        params={{ guildId }}
        className="inline-flex items-center gap-2 self-start text-sm text-stone-400 transition hover:text-white"
      >
        <Icon name="arrowLeft" className="size-4" />
        Tous les giveaways
      </Link>
      <PageHeader
        title="Nouveau giveaway"
        description="Le bot le publie tout de suite dans le salon choisi ; les membres participent d'un clic."
      />
      {error && <LoadError error={error} onRetry={retry} />}
      {!error && (!channels.data || !roles.data) && (
        <PageSkeleton label="Chargement du formulaire…" panels={2} />
      )}
      {!error && channels.data && roles.data && (
        <GiveawayForm
          channels={channels.data}
          roles={roles.data}
          onCancel={() => void backToList()}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            await backToList();
          }}
        />
      )}
    </div>
  );
}
