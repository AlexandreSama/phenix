import type { Td2CatalogueActivity } from '@phenix/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../../components/icon';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';
import { Switch } from '../../../components/ui/switch';
import { useCreateMode, useDeleteMode, useUpdateActivity, useUpdateMode } from '../api';
import { ModeForm } from './mode-form';

/** Une activité du catalogue : son nom, son état, et ses modes. */
export function ActivityCard({ activity }: { activity: Td2CatalogueActivity }) {
  const updateActivity = useUpdateActivity();
  const createMode = useCreateMode();
  const updateMode = useUpdateMode();
  const deleteMode = useDeleteMode();
  const [name, setName] = useState(activity.name);
  const [error, setError] = useState<string | null>(null);
  // Sans mode, le formulaire d'ajout est ouvert d'office : l'activité n'est pas utilisable sans
  const [adding, setAdding] = useState(activity.modes.length === 0);
  // L'interrupteur suit le clic tout de suite ; la réponse de l'API (ou une erreur) le recale
  const [active, setActive] = useState(activity.active);
  useEffect(() => setActive(activity.active), [activity.active]);

  const patch = async (change: { name?: string; active?: boolean }) => {
    setError(null);
    try {
      await updateActivity.mutateAsync({ id: activity.id, patch: change });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
      setName(activity.name);
      setActive(activity.active);
    }
  };

  return (
    <article aria-label={activity.name} className="rounded-2xl border border-white/8 bg-surface">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-white/6 px-5 py-4 sm:px-6">
        <form
          className="flex min-w-0 flex-1 basis-64 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed && trimmed !== activity.name) void patch({ name: trimmed });
          }}
        >
          <input
            aria-label={`Nom de ${activity.name}`}
            className={`${inputClass} max-w-xs font-display font-semibold`}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          {name.trim() !== activity.name && (
            <Button type="submit" variant="ghost" className="min-h-11">
              Renommer
            </Button>
          )}
          {!active && <Badge tone="muted">Masquée</Badge>}
        </form>
        <Switch
          id={`activity-${activity.id}-active`}
          label="Proposée dans /td2"
          checked={active}
          onChange={(event) => {
            setActive(event.target.checked);
            void patch({ active: event.target.checked });
          }}
        />
      </header>

      <div
        className={`flex flex-col gap-3 p-5 transition-opacity sm:p-6 ${active ? '' : 'opacity-75'}`}
      >
        {error && (
          <p role="alert" className="text-[13px] text-flame">
            {error}
          </p>
        )}
        <p className="text-xs font-semibold tracking-widest text-stone-400 uppercase">
          Modes
          <span className="sr-only"> de {activity.name}</span>
        </p>
        {activity.modes.map((mode) => (
          <ModeForm
            key={mode.id}
            mode={mode}
            idPrefix={`mode-${mode.id}`}
            onSubmit={(input) => updateMode.mutateAsync({ modeId: mode.id, input })}
            onDelete={() => deleteMode.mutateAsync(mode.id)}
          />
        ))}
        {adding ? (
          <ModeForm
            idPrefix={`new-mode-${activity.id}`}
            onSubmit={async (input) => {
              await createMode.mutateAsync({ activityId: activity.id, input });
              setAdding(false);
            }}
            // Une activité sans mode garde son formulaire : rien à refermer
            onCancel={activity.modes.length > 0 ? () => setAdding(false) : undefined}
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" className="size-4" />
            Ajouter un mode
          </Button>
        )}
      </div>
    </article>
  );
}
