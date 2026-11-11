import { zodResolver } from '@hookform/resolvers/zod';
import {
  TD2_ROLE_LABELS,
  td2ModeInputSchema,
  type Td2CatalogueMode,
  type Td2ModeInput,
  type Td2RoleKey,
} from '@phenix/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';

const ROLES = Object.keys(TD2_ROLE_LABELS) as Td2RoleKey[];
const EMPTY_SLOTS: Record<Td2RoleKey, number> = { DPS: 0, HEAL: 0, TANK: 0, HEAL_TANK: 0 };
/** Le maximum d'une sortie dans le jeu */
const MAX_PLAYERS = 8;

const labelClass = 'flex flex-col gap-1.5 text-[13px] font-medium text-stone-300';

interface Props {
  /** Un mode existant à modifier ; absent = formulaire d'ajout */
  mode?: Td2CatalogueMode;
  /** Préfixe des id HTML : plusieurs formulaires vivent sur la même page */
  idPrefix: string;
  onSubmit: (input: Td2ModeInput) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  /** Formulaire d'ajout : « Annuler » le referme */
  onCancel?: () => void;
}

/** Un mode : son nom et une place par rôle. Le total est recalculé à chaque frappe. */
export function ModeForm({ mode, idPrefix, onSubmit, onDelete, onCancel }: Props) {
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
      className={`flex flex-col gap-4 rounded-xl border p-4 ${
        mode ? 'border-white/8 bg-ink/40' : 'border-dashed border-white/15'
      }`}
    >
      {/* Téléphone : le nom sur toute la largeur, puis les quatre rôles et le total */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-[minmax(0,1fr)_repeat(4,4.75rem)_4.5rem] sm:items-end">
        <label className={`${labelClass} col-span-4 sm:col-span-1`}>
          Nom du mode
          <input
            id={`${idPrefix}-name`}
            className={inputClass}
            placeholder="Normal, Semi-Speed…"
            {...register('name')}
          />
        </label>
        {ROLES.map((role) => (
          <label key={role} className={labelClass}>
            {TD2_ROLE_LABELS[role]}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_PLAYERS}
              className={`${inputClass} text-center tabular-nums`}
              {...register(`slots.${role}`, { valueAsNumber: true })}
            />
          </label>
        ))}
        {/* Téléphone : « Total » et son compteur sur une ligne ; ordinateur : en colonne */}
        <div className="col-span-4 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-stretch sm:gap-1.5">
          <span className="text-[13px] font-medium text-stone-300">Total</span>
          <p
            className={`flex min-h-11 min-w-20 items-center justify-center rounded-lg px-3 text-sm font-semibold tabular-nums sm:min-w-0 ${
              total > MAX_PLAYERS ? 'bg-flame/15 text-[#ff8a4c]' : 'bg-white/6 text-stone-100'
            }`}
          >
            {total}/{MAX_PLAYERS}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant={mode ? 'ghost' : 'primary'}
          disabled={isSubmitting || !isDirty}
        >
          {mode ? (
            'Enregistrer'
          ) : (
            <>
              <Icon name="plus" className="size-4" />
              Ajouter le mode
            </>
          )}
        </Button>
        {!mode && onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
        {mode && onDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={mode.eventCount > 0}
            title={mode.eventCount > 0 ? 'Un mode qui a servi ne se supprime pas' : undefined}
          >
            <Icon name="trash" className="size-4" />
            Supprimer
          </Button>
        )}
        {mode && mode.eventCount > 0 && (
          <p className="text-[13px] text-stone-400">
            A servi à {mode.eventCount} sortie{mode.eventCount > 1 ? 's' : ''}.
          </p>
        )}
      </div>
      {message && (
        <p role="alert" className="text-[13px] text-flame">
          {message}
        </p>
      )}
    </form>
  );
}
