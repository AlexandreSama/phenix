import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { PageHeader } from '../../../components/ui/panel';
import { channelsQuery, rolePanelQuery, rolesQuery, useSaveRolePanel } from '../api';
import { PublicationBadge } from '../publication-badge';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { toFormValues } from './form-values';
import { RolePanelForm } from './role-panel-form';

export function RolePanelEditorPage() {
  const { guildId, panelId } = useParams({ from: '/dashboard/$guildId/roles/$panelId' });
  const id = panelId === 'nouveau' ? undefined : Number(panelId);
  const navigate = useNavigate();

  const [channels, roles] = useQueries({ queries: [channelsQuery(guildId), rolesQuery(guildId)] });
  const panel = useQuery({ ...rolePanelQuery(guildId, id ?? 0), enabled: id !== undefined });
  const save = useSaveRolePanel(guildId, id);

  const { error, retry } = firstFailure([channels, roles, panel]);
  const ready = channels.data && roles.data && (id === undefined || panel.data);
  const backToList = () => navigate({ to: '/dashboard/$guildId/roles', params: { guildId } });

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/dashboard/$guildId/roles"
        params={{ guildId }}
        className="inline-flex items-center gap-2 self-start text-sm text-stone-400 transition hover:text-white"
      >
        <Icon name="arrowLeft" className="size-4" />
        Tous les panels
      </Link>
      <PageHeader
        title={id === undefined ? 'Nouveau panel' : 'Modifier le panel'}
        description="Le bot publie le message dans le salon choisi ; chaque modification le met à jour sur Discord."
        actions={panel.data && <PublicationBadge status={panel.data.status} />}
      />
      {error && <LoadError error={error} onRetry={retry} />}
      {!error && !ready && <PageSkeleton label="Chargement du panel…" panels={2} />}
      {!error && ready && (
        <RolePanelForm
          // Remonte le formulaire quand le panel chargé change
          key={panel.data?.id ?? 'nouveau'}
          defaultValues={toFormValues(panel.data)}
          channels={channels.data}
          roles={roles.data}
          onCancel={() => void backToList()}
          onSubmit={async (input) => {
            await save.mutateAsync(input);
            await backToList();
          }}
        />
      )}
    </div>
  );
}
