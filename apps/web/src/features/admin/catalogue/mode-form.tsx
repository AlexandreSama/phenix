import { zodResolver } from '@hookform/resolvers/zod';
import {
  TD2_ROLE_LABELS,
  td2ModeInputSchema,
  type Td2CatalogueMode,
  type Td2ModeInput,
  type Td2RoleKey,
} from '@phenix/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';

const ROLES = Object.keys(TD2_ROLE_LABELS) as Td2RoleKey[];
const EMPTY_SLOTS: Record<Td2RoleKey, number> = { DPS: 0, HEAL: 0, TANK: 0, HEAL_TANK: 0 };

interface Props {
  /** Un mode existant à modifier ; absent = formulaire d'ajout */
  mode?: Td2CatalogueMode;
  /** Préfixe des id HTML : plusieurs formulaires vivent sur la même page */
  idPrefix: string;
  onSubmit: (input: Td2ModeInput) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}

/** Un mode : son nom et une place par rôle. Le total est recalculé à chaque frappe. */
export function ModeForm({ mode, idPrefix, onSubmit, onDelete }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Td2ModeInput>({
    resolver: zodResolver(td2ModeInputSchema),
    defaultValues: { name: mode?.name ?? '', slots: mode?.slots ?? EMPTY_SLOTS },
  });
  const slots = useWatch({ control, name: 'slots' });
  const total = ROLES.reduce((sum, role) => sum + (Number(slots?.[role]) || 0), 0);

  const save = async (input: Td2ModeInput) => {
    try {
      await onSubmit(input);
      // Un ajout repart à vide ; une modification garde ce qui vient d'être enregistré
      reset(mode ? input : { name: '', slots: EMPTY_SLOTS });
    } catch (error) {
      setError('root.server', { message: error instanceof Error ? error.message : 'Échec' });
    }
  };

  const remove = async () => {
    try {
      await onDelete?.();
    } catch (error) {
      setError('root.server', { message: error instanceof Error ? error.message : 'Échec' });
    }
  };

  const message = errors.name?.message ?? errors.slots?.message ?? errors.root?.server?.message;
  return (
    <form
      onSubmit={handleSubmit(save)}
      noValidate
      aria-label={mode ? `Mode ${mode.name}` : 'Nouveau mode'}
      className="flex flex-col gap-2 border-t border-brown py-3 first:border-t-0"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-stone-400">
          Nom du mode
          <input
            id={`${idPrefix}-name`}
            className={inputClass}
            placeholder="Normal, Semi-Speed…"
            {...register('name')}
          />
        </label>
        {ROLES.map((role) => (
          <label key={role} className="flex w-20 flex-col gap-1 text-xs text-stone-400">
            {TD2_ROLE_LABELS[role]}
            <input
              type="number"
              min={0}
              max={8}
              className={inputClass}
              {...register(`slots.${role}`, { valueAsNumber: true })}
            />
          </label>
        ))}
        <p className={`pb-2 text-sm tabular-nums ${total > 8 ? 'text-flame' : 'text-stone-300'}`}>
          {total}/8
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant={mode ? 'ghost' : 'primary'}
          disabled={isSubmitting || !isDirty}
        >
          {mode ? 'Enregistrer' : 'Ajouter le mode'}
        </Button>
        {mode && onDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={mode.eventCount > 0}
            title={mode.eventCount > 0 ? 'Un mode qui a servi ne se supprime pas' : undefined}
          >
            Supprimer
          </Button>
        )}
        {mode && mode.eventCount > 0 && (
          <p className="text-xs text-stone-400">
            A servi à {mode.eventCount} sortie{mode.eventCount > 1 ? 's' : ''}.
          </p>
        )}
      </div>
      {message && (
        <p role="alert" className="text-xs text-flame">
          {message}
        </p>
      )}
    </form>
  );
}
