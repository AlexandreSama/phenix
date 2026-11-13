import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { PageHeader } from '../../../components/ui/panel';
import { categoriesQuery, rolesQuery, ticketTypeQuery, useSaveTicketType } from '../api';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { TicketTypeForm } from './ticket-type-form';
import { toTypeFormValues } from './type-form-values';

/** `types/nouveau` crée un type, `types/<id>` le modifie. */
export function TicketTypeEditorPage() {
  const { guildId, typeId } = useParams({ strict: false }) as { guildId: string; typeId?: string };
  const id = typeId === undefined ? undefined : Number(typeId);
  const navigate = useNavigate();

  const [categories, roles] = useQueries({
    queries: [categoriesQuery(guildId), rolesQuery(guildId)],
  });
  const type = useQuery({ ...ticketTypeQuery(guildId, id ?? 0), enabled: id !== undefined });
  const save = useSaveTicketType(guildId, id);

  const { error, retry } = firstFailure([categories, roles, type]);
  const ready = categories.data && roles.data && (id === undefined || type.data);
  const backToSettings = () =>
    navigate({ to: '/dashboard/$guildId/tickets/reglages', params: { guildId } });

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/dashboard/$guildId/tickets/reglages"
        params={{ guildId }}
        className="inline-flex items-center gap-2 self-start text-sm text-stone-400 transition hover:text-white"
      >
        <Icon name="arrowLeft" className="size-4" />
        Réglages des tickets
      </Link>
      <PageHeader
        title={id === undefined ? 'Nouveau type de ticket' : 'Modifier le type de ticket'}
        description="Une catégorie de salons, l’équipe qui répond, et un formulaire de 0 à 5 questions."
      />
      {error && <LoadError error={error} onRetry={retry} />}
      {!error && !ready && <PageSkeleton label="Chargement du type…" panels={3} />}
      {!error && ready && (
        <TicketTypeForm
          // Remonte le formulaire quand le type chargé change
          key={type.data?.id ?? 'nouveau'}
          defaultValues={toTypeFormValues(type.data)}
          categories={categories.data}
          roles={roles.data}
          onCancel={() => void backToSettings()}
          onSubmit={async (input) => {
            await save.mutateAsync(input);
            await backToSettings();
          }}
        />
      )}
    </div>
  );
}
