import { TICKET_LIMITS } from '@phenix/shared';
import { useQueries } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';
import { Panel, PageHeader } from '../../../components/ui/panel';
import {
  channelsQuery,
  ticketSettingsQuery,
  ticketTypesQuery,
  useDeleteTicketType,
  useSaveTicketSettings,
} from '../api';
import { PublicationBadge } from '../publication-badge';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { TicketSettingsForm } from './ticket-settings-form';
import { TicketTypeList } from './ticket-type-list';

export function TicketSettingsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/tickets/reglages' });
  const queries = useQueries({
    queries: [channelsQuery(guildId), ticketSettingsQuery(guildId), ticketTypesQuery(guildId)],
  });
  const [channels, settings, types] = queries;
  const save = useSaveTicketSettings(guildId);
  const remove = useDeleteTicketType(guildId);

  const { error, retry } = firstFailure(queries);
  const current = settings.data?.settings;

  const addType = (
    <Link
      to="/dashboard/$guildId/tickets/types/nouveau"
      params={{ guildId }}
      className={buttonClass('primary')}
    >
      <Icon name="plus" className="size-4" />
      Ajouter un type
    </Link>
  );

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
        description="Les types de ticket, le journal, et le message avec le bouton pour en ouvrir un."
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
      {!error && (!channels.data || !settings.data || !types.data) && (
        <PageSkeleton label="Chargement des réglages…" panels={3} />
      )}
      {!error && channels.data && settings.data && types.data && (
        <>
          <Panel
            icon="ticket"
            title="Types de ticket"
            description={`Un type par motif d’ouverture, avec sa catégorie, son équipe et son formulaire. ${TICKET_LIMITS.types} au plus.`}
          >
            {remove.error && (
              <p role="alert" className="text-sm text-flame">
                {remove.error.message}
              </p>
            )}
            <TicketTypeList
              types={types.data}
              add={addType}
              edit={(type) => (
                <Link
                  to="/dashboard/$guildId/tickets/types/$typeId"
                  params={{ guildId, typeId: String(type.id) }}
                  className={buttonClass('ghost')}
                >
                  <Icon name="pencil" className="size-4" />
                  Modifier <span className="sr-only">{type.name}</span>
                </Link>
              )}
              onDelete={(typeId) => remove.mutateAsync(typeId)}
            />
          </Panel>
          <TicketSettingsForm
            // Les relectures toutes les 2 s ne remontent pas le formulaire : seul l'état du panel change
            settings={settings.data.settings}
            channels={channels.data}
            onSubmit={(input) => save.mutateAsync(input)}
          />
        </>
      )}
    </div>
  );
}
