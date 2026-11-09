import { useQueries } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Card } from '../../../components/ui/card';
import { channelsQuery, rolesQuery, useCreateGiveaway } from '../api';
import { GiveawayForm } from './giveaway-form';

export function GiveawayCreatePage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/giveaways/nouveau' });
  const navigate = useNavigate();
  const [channels, roles] = useQueries({
    queries: [channelsQuery(guildId), rolesQuery(guildId)],
  });
  const create = useCreateGiveaway(guildId);
  const error = channels.error ?? roles.error;

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/dashboard/$guildId/giveaways"
        params={{ guildId }}
        className="text-sm text-stone-400 hover:text-white"
      >
        ← Tous les giveaways
      </Link>
      <Card>
        <h2 className="mb-6 text-lg font-semibold text-white">Nouveau giveaway</h2>
        {error && <p role="alert">{error.message}</p>}
        {!error && (!channels.data || !roles.data) && <p>Chargement…</p>}
        {!error && channels.data && roles.data && (
          <GiveawayForm
            channels={channels.data}
            roles={roles.data}
            onSubmit={async (input) => {
              await create.mutateAsync(input);
              await navigate({ to: '/dashboard/$guildId/giveaways', params: { guildId } });
            }}
          />
        )}
      </Card>
    </section>
  );
}
