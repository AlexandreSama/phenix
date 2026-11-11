import { useQueries } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { PageHeader } from '../../../components/ui/panel';
import {
  categoriesQuery,
  channelsQuery,
  rolesQuery,
  ticketSettingsQuery,
  useSaveTicketSettings,
} from '../api';
import { PublicationBadge } from '../publication-badge';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { TicketSettingsForm } from './ticket-settings-form';

export function TicketSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/tickets/reglages' });
  const queries = useQueries({
    queries: [
      categoriesQuery(guildId),
      channelsQuery(guildId),
      rolesQuery(guildId),
      ticketSettingsQuery(guildId),
    ],
  });
  const [categories, channels, roles, settings] = queries;
  const save = useSaveTicketSettings(guildId);

  const { error, retry } = firstFailure(queries);
  const current = settings.data?.settings;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/dashboard/$guildId/tickets"
        params={{ guildId }}
        className="inline-flex items-center gap-2 self-start text-sm text-stone-400 transition hover:text-white"
      >
        <Icon name="arrowLeft" className="size-4" />
        Tous les tickets
      </Link>
      <PageHeader
        title="Réglages des tickets"
        description="Où s'ouvrent les tickets, qui y répond, et le message avec le bouton pour en ouvrir un."
        actions={current && <PublicationBadge status={current.panelStatus} />}
      />
      {current?.panelError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-ember/60 bg-ember/10 p-5"
        >
          <Icon name="alert" className="mt-0.5 size-5 text-[#ff8a4c]" />
          <p className="text-sm text-stone-200">
            Le panel n’a pas pu être publié : {current.panelError}
          </p>
        </div>
      )}
      {error && <LoadError error={error} onRetry={retry} />}
      {!error && (!categories.data || !channels.data || !roles.data || !settings.data) && (
        <PageSkeleton label="Chargement des réglages…" panels={3} />
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
    </div>
  );
}
