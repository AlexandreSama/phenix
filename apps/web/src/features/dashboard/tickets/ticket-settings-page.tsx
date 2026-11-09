import { useQueries } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Card } from '../../../components/ui/card';
import {
  categoriesQuery,
  channelsQuery,
  rolesQuery,
  ticketSettingsQuery,
  useSaveTicketSettings,
} from '../api';
import { PublicationBadge } from '../publication-badge';
import { TicketSettingsForm } from './ticket-settings-form';

export function TicketSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/tickets/reglages' });
  const [categories, channels, roles, settings] = useQueries({
    queries: [
      categoriesQuery(guildId),
      channelsQuery(guildId),
      rolesQuery(guildId),
      ticketSettingsQuery(guildId),
    ],
  });
  const save = useSaveTicketSettings(guildId);

  const error = categories.error ?? channels.error ?? roles.error ?? settings.error;
  const current = settings.data?.settings;

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/dashboard/$guildId/tickets"
        params={{ guildId }}
        className="text-sm text-stone-400 hover:text-white"
      >
        ← Tous les tickets
      </Link>
      <Card>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Réglages des tickets</h2>
          {current && <PublicationBadge status={current.panelStatus} />}
        </div>
        {current?.panelError && (
          <p role="alert" className="mb-6 text-sm text-flame">
            Le panel n’a pas pu être publié : {current.panelError}
          </p>
        )}
        {error && <p role="alert">{error.message}</p>}
        {!error && (!categories.data || !channels.data || !roles.data || !settings.data) && (
          <p>Chargement…</p>
        )}
        {!error && categories.data && channels.data && roles.data && settings.data && (
          <TicketSettingsForm
            // Les relectures toutes les 2 s ne remontent pas le formulaire : seul l'état du panel change
            settings={settings.data.settings}
            categories={categories.data}
            channels={channels.data}
            roles={roles.data}
            onSubmit={(input) => save.mutateAsync(input)}
          />
        )}
      </Card>
    </section>
  );
}
