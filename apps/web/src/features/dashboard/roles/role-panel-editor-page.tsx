import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Card } from '../../../components/ui/card';
import { channelsQuery, rolePanelQuery, rolesQuery, useSaveRolePanel } from '../api';
import { toFormValues } from './form-values';
import { RolePanelForm } from './role-panel-form';

export function RolePanelEditorPage() {
  const { guildId, panelId } = useParams({ from: '/dashboard/$guildId/roles/$panelId' });
  const id = panelId === 'nouveau' ? undefined : Number(panelId);
  const navigate = useNavigate();

  const [channels, roles] = useQueries({ queries: [channelsQuery(guildId), rolesQuery(guildId)] });
  const panel = useQuery({ ...rolePanelQuery(guildId, id ?? 0), enabled: id !== undefined });
  const save = useSaveRolePanel(guildId, id);

  const error = channels.error ?? roles.error ?? panel.error;
  const ready = channels.data && roles.data && (id === undefined || panel.data);

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/dashboard/$guildId/roles"
        params={{ guildId }}
        className="text-sm text-stone-400 hover:text-white"
      >
        ← Tous les panels
      </Link>
      <Card>
        <h2 className="mb-6 text-lg font-semibold text-white">
          {id === undefined ? 'Nouveau panel' : 'Modifier le panel'}
        </h2>
        {error && <p role="alert">{error.message}</p>}
        {!error && !ready && <p>Chargement…</p>}
        {!error && ready && (
          <RolePanelForm
            // Remonte le formulaire quand le panel chargé change
            key={panel.data?.id ?? 'nouveau'}
            defaultValues={toFormValues(panel.data)}
            channels={channels.data}
            roles={roles.data}
            onSubmit={async (input) => {
              await save.mutateAsync(input);
              await navigate({ to: '/dashboard/$guildId/roles', params: { guildId } });
            }}
          />
        )}
      </Card>
    </section>
  );
}
