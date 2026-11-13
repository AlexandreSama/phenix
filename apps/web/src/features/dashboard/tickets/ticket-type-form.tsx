import { zodResolver } from '@hookform/resolvers/zod';
import {
  TICKET_INACTIVITY_CHOICES,
  TICKET_LIMITS,
  type GuildCategorySummary,
  type GuildRoleSummary,
  type TicketTypeInput,
} from '@phenix/shared';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { RoleChecklist } from '../form-parts';
import {
  emptyQuestion,
  inactivityLabel,
  ticketTypeFormSchema,
  type TicketTypeFormInput,
} from './type-form-values';

interface Props {
  defaultValues: TicketTypeFormInput;
  categories: GuildCategorySummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: TicketTypeInput) => Promise<unknown>;
  /** « Annuler » : retour aux réglages, sans rien enregistrer */
  onCancel?: () => void;
}

/** Les petits boutons carrés d'une question : monter, descendre, retirer. */
const iconButton =
  'flex size-9 items-center justify-center rounded-lg border border-white/10 text-stone-300 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-gold disabled:pointer-events-none disabled:opacity-30';

/** Le formulaire d'un type de ticket et de ses questions. Il ne sait rien de l'API. */
export function TicketTypeForm({ defaultValues, categories, roles, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TicketTypeFormInput, unknown, TicketTypeInput>({
    resolver: zodResolver(ticketTypeFormSchema),
    defaultValues,
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'questions' });

  const save = async (input: TicketTypeInput) => {
    try {
      await onSubmit(input);
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(save)} noValidate className="flex flex-col gap-6">
      <Panel
        icon="ticket"
        title="Type de ticket"
        description="Le type que le membre choisit dans le menu « Type de ticket », après un clic sur le bouton du panel."
      >
        <Field id="typeName" label="Nom" error={errors.name?.message}>
          <input id="typeName" className={inputClass} {...register('name')} />
        </Field>
        <Field
          id="typeDescription"
          label="Description"
          hint="Facultative. Affichée sous le nom dans le menu déroulant."
          error={errors.description?.message}
        >
          <input id="typeDescription" className={inputClass} {...register('description')} />
        </Field>
        <Field id="typeEmoji" label="Emoji" hint="Facultatif." error={errors.emoji?.message}>
          <input id="typeEmoji" className={inputClass} {...register('emoji')} />
        </Field>
        <Field
          id="typeCategoryId"
          label="Catégorie des salons"
          hint="Les salons de ce type y sont créés. Le bot doit pouvoir y gérer les salons."
          error={errors.categoryId?.message}
        >
          <select id="typeCategoryId" className={inputClass} {...register('categoryId')}>
            <option value="">Choisis une catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </Panel>

      <Panel
        icon="users"
        title="Équipe"
        description="Ces rôles voient les tickets de ce type, y répondent et peuvent les fermer."
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Équipe de ce type</legend>
          <RoleChecklist roles={roles} registration={register('staffRoleIds')} />
          {errors.staffRoleIds && (
            <p role="alert" className="text-[13px] text-flame">
              {errors.staffRoleIds.message}
            </p>
          )}
        </fieldset>
      </Panel>

      <Panel
        icon="clock"
        title="Délai d’inactivité"
        description="Ferme les tickets de ce type laissés sans nouveau message."
      >
        <Field
          id="typeInactivityHours"
          label="Fermeture automatique"
          hint="Un rappel est posté dans le salon à la moitié du délai, puis le ticket est fermé avec son transcript s’il est resté sans nouveau message. Tout nouveau message dans le salon du ticket (hors fils de discussion) remet le compteur à zéro."
          error={errors.inactivityHours?.message}
        >
          <Controller
            control={control}
            name="inactivityHours"
            render={({ field }) => (
              <select
                id="typeInactivityHours"
                className={inputClass}
                value={field.value ?? ''}
                onChange={(event) =>
                  field.onChange(event.target.value === '' ? null : Number(event.target.value))
                }
                onBlur={field.onBlur}
                ref={field.ref}
              >
                <option value="">Désactivée</option>
                {TICKET_INACTIVITY_CHOICES.map((hours) => (
                  <option key={hours} value={hours}>
                    {inactivityLabel(hours)}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>
      </Panel>

      <Panel
        icon="file"
        title="Formulaire"
        description="Des questions posées au membre avant l’ouverture du salon. Facultatif."
        aside={
          <span className="text-sm text-stone-400 tabular-nums">
            {fields.length} / {TICKET_LIMITS.questions}
          </span>
        }
      >
        <p className="rounded-lg border border-gold/30 bg-gold/6 px-4 py-3 text-sm text-stone-200">
          Ne demande pas de données sensibles (santé, âge, etc.) : les réponses restent dans le
          transcript du ticket.
        </p>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Questions</legend>
          {fields.map((field, index) => {
            const questionErrors = errors.questions?.[index];
            return (
              <div
                key={field.id}
                className="flex flex-col gap-4 rounded-xl border border-white/8 bg-ink/40 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold tracking-widest text-stone-400 uppercase">
                    Question {index + 1}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className={iconButton}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      aria-label={`Monter la question ${index + 1}`}
                    >
                      <Icon name="chevronUp" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                      aria-label={`Descendre la question ${index + 1}`}
                    >
                      <Icon name="chevronDown" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => remove(index)}
                      aria-label={`Retirer la question ${index + 1}`}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                </div>
                <Field
                  id={`question-${index}-label`}
                  label={`Question ${index + 1}`}
                  hint={`${TICKET_LIMITS.questionLabel} caractères au plus.`}
                  error={questionErrors?.label?.message}
                >
                  <input
                    id={`question-${index}-label`}
                    className={inputClass}
                    {...register(`questions.${index}.label`)}
                  />
                </Field>
                <Field
                  id={`question-${index}-placeholder`}
                  label={`Texte d’aide ${index + 1}`}
                  hint="Facultatif. Grisé dans le champ, tant que le membre n’a rien écrit."
                  error={questionErrors?.placeholder?.message}
                >
                  <input
                    id={`question-${index}-placeholder`}
                    className={inputClass}
                    {...register(`questions.${index}.placeholder`)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={`question-${index}-style`} label={`Format ${index + 1}`}>
                    <select
                      id={`question-${index}-style`}
                      className={inputClass}
                      {...register(`questions.${index}.style`)}
                    >
                      <option value="SHORT">Court (une ligne)</option>
                      <option value="PARAGRAPH">Paragraphe</option>
                    </select>
                  </Field>
                  <Field
                    id={`question-${index}-maxLength`}
                    label={`Longueur maximale ${index + 1}`}
                    error={questionErrors?.maxLength?.message}
                  >
                    <input
                      id={`question-${index}-maxLength`}
                      type="number"
                      className={inputClass}
                      {...register(`questions.${index}.maxLength`, { valueAsNumber: true })}
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-3 text-sm text-stone-200">
                  <input
                    type="checkbox"
                    className="size-4 accent-flame"
                    aria-label={`Réponse obligatoire ${index + 1}`}
                    {...register(`questions.${index}.required`)}
                  />
                  Réponse obligatoire
                </label>
              </div>
            );
          })}
          {errors.questions?.root?.message && (
            <p role="alert" className="text-[13px] text-flame">
              {errors.questions.root.message}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            disabled={fields.length >= TICKET_LIMITS.questions}
            onClick={() => append(emptyQuestion)}
          >
            <Icon name="plus" className="size-4" />
            Ajouter une question
          </Button>
        </fieldset>
      </Panel>

      <FormActions
        submitLabel="Enregistrer"
        submittingLabel="Enregistrement…"
        isSubmitting={isSubmitting}
        error={errors.root?.server?.message}
        idle="Le panel est mis à jour sur Discord dès l’enregistrement."
        secondary={
          onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          )
        }
      />
    </form>
  );
}
