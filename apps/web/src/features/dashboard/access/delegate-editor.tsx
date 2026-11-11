import type { DashboardModuleKey } from '@phenix/shared';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { ModuleChecklist } from './module-checklist';

interface Props {
  /** Le nom du membre, pour la légende et les boutons */
  name: string;
  initial: DashboardModuleKey[];
  submitLabel: string;
  onSubmit: (modules: DashboardModuleKey[]) => Promise<unknown>;
  onCancel: () => void;
}

/** Les onglets à ouvrir à un membre : on coche, on enregistre. Sans case cochée, rien à envoyer. */
export function DelegateEditor({ name, initial, submitLabel, onSubmit, onCancel }: Props) {
  const [modules, setModules] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const legendId = useId();
  const unchanged =
    modules.length === initial.length && modules.every((module) => initial.includes(module));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit(modules);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Enregistrement impossible');
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-labelledby={legendId}
      className="flex flex-col gap-4"
    >
      <fieldset className="flex flex-col gap-3">
        <legend id={legendId} className="mb-3 text-sm font-medium text-stone-100">
          Onglets ouverts à {name}
        </legend>
        <ModuleChecklist
          idPrefix={legendId}
          value={modules}
          onChange={setModules}
          disabled={pending}
        />
      </fieldset>
      {error && (
        <p role="alert" className="text-[13px] text-flame">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-11">
          Annuler
        </Button>
        <Button
          type="submit"
          disabled={pending || modules.length === 0 || unchanged}
          className="min-h-11"
        >
          {pending ? 'Enregistrement…' : submitLabel}
        </Button>
      </div>
      {modules.length === 0 && (
        <p className="text-right text-[13px] text-stone-400">
          {initial.length > 0
            ? 'Coche au moins un onglet ; pour tout retirer, utilise « Retirer l’accès ».'
            : 'Coche les onglets à lui ouvrir.'}
        </p>
      )}
    </form>
  );
}
