import { zodResolver } from '@hookform/resolvers/zod';
import {
  ROLE_PANEL_LIMITS,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type RolePanelInput,
} from '@phenix/shared';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { ChannelOptions } from '../form-parts';
import { emptyOption, rolePanelFormSchema, type RolePanelFormInput } from './form-values';
import { PanelPreview } from './panel-preview';

interface Props {
  defaultValues: RolePanelFormInput;
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: RolePanelInput) => Promise<unknown>;
  /** « Annuler » : retour à la liste, sans rien enregistrer */
  onCancel?: () => void;
}

const MODES = [
  { value: 'MULTIPLE', label: 'Plusieurs rôles', hint: 'Chaque bouton ajoute ou retire son rôle.' },
  { value: 'UNIQUE', label: 'Un seul rôle', hint: 'Prendre un rôle retire les autres du panel.' },
] as const;

/** Les petits boutons carrés d'un rôle : monter, descendre, retirer. */
const iconButton =
  'flex size-9 items-center justify-center rounded-lg border border-white/10 text-stone-300 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-gold disabled:pointer-events-none disabled:opacity-30';

/** Le formulaire d'un panel, avec l'aperçu du message à côté. Il ne sait rien de l'API. */
export function RolePanelForm({ defaultValues, channels, roles, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RolePanelFormInput, unknown, RolePanelInput>({
    resolver: zodResolver(rolePanelFormSchema),
    defaultValues,
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'options' });
  const values = useWatch({ control }) as RolePanelFormInput;

  const save = async (input: RolePanelInput) => {
    try {
      await onSubmit(input);
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(save)}
      noValidate
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Panel
          icon="file"
          title="Message"
          description="Ce que les membres lisent au-dessus des boutons."
        >
          <Field id="title" label="Titre" error={errors.title?.message}>
            <input id="title" className={inputClass} {...register('title')} />
          </Field>
          <Field
            id="description"
            label="Description"
            hint="Facultative. Explique à quoi servent les rôles."
            error={errors.description?.message}
          >
            <textarea
              id="description"
              rows={3}
              className={inputClass}
              {...register('description')}
            />
          </Field>
          <Field id="channelId" label="Salon du panel" error={errors.channelId?.message}>
            <select id="channelId" className={inputClass} {...register('channelId')}>
              <ChannelOptions channels={channels} empty="Choisis un salon" />
            </select>
          </Field>
        </Panel>

        <Panel icon="sliders" title="Mode" description="Ce qui se passe quand un membre clique.">
          <fieldset>
            <legend className="sr-only">Mode</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODES.map((mode) => (
                <label
                  key={mode.value}
                  className="flex cursor-pointer gap-3 rounded-xl border border-white/10 p-4 transition hover:border-white/20 has-checked:border-flame/60 has-checked:bg-flame/8"
                >
                  <input
                    type="radio"
                    value={mode.value}
                    className="mt-0.5 size-4 accent-flame"
                    {...register('mode')}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-stone-100">{mode.label}</span>
                    <span className="text-[13px] text-stone-400">{mode.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>

        <Panel
          icon="tag"
          title="Boutons"
          description="Un bouton par rôle. Les rôles grisés sont au-dessus du bot ou réservés à la modération."
          aside={
            <span className="text-sm text-stone-400 tabular-nums">
              {fields.length} / {ROLE_PANEL_LIMITS.options}
            </span>
          }
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Boutons</legend>
            {fields.map((field, index) => {
              const optionErrors = errors.options?.[index];
              const roleField = register(`options.${index}.roleId`);
              return (
                <div
                  key={field.id}
                  className="flex flex-col gap-4 rounded-xl border border-white/8 bg-ink/40 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold tracking-widest text-stone-400 uppercase">
                      Bouton {index + 1}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className={iconButton}
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                        aria-label={`Monter le rôle ${index + 1}`}
                      >
                        <Icon name="chevronUp" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        disabled={index === fields.length - 1}
                        onClick={() => move(index, index + 1)}
                        aria-label={`Descendre le rôle ${index + 1}`}
                      >
                        <Icon name="chevronDown" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                        aria-label={`Retirer le rôle ${index + 1}`}
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    </div>
                  </div>
                  {/* Le rôle sur toute la largeur : son nom peut être long ; texte et emoji dessous */}
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_96px]">
                    <div className="sm:col-span-2">
                      <Field
                        id={`option-${index}-role`}
                        label={`Rôle ${index + 1}`}
                        error={optionErrors?.roleId?.message}
                      >
                        <select
                          id={`option-${index}-role`}
                          className={inputClass}
                          {...roleField}
                          onChange={async (event) => {
                            await roleField.onChange(event);
                            // Le texte du bouton reprend le nom du rôle, tant qu'on ne l'a pas écrit
                            const role = roles.find((entry) => entry.id === event.target.value);
                            if (role && !getValues(`options.${index}.label`)) {
                              setValue(`options.${index}.label`, role.name, {
                                shouldValidate: true,
                              });
                            }
                          }}
                        >
                          <option value="">Choisis un rôle</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id} disabled={!role.assignable}>
                              {role.name}
                              {role.blockedReason ? ` — ${role.blockedReason}` : ''}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field
                      id={`option-${index}-label`}
                      label="Texte du bouton"
                      error={optionErrors?.label?.message}
                    >
                      <input
                        id={`option-${index}-label`}
                        className={inputClass}
                        {...register(`options.${index}.label`)}
                      />
                    </Field>
                    <Field
                      id={`option-${index}-emoji`}
                      label="Emoji"
                      error={optionErrors?.emoji?.message}
                    >
                      <input
                        id={`option-${index}-emoji`}
                        placeholder="Aucun"
                        className={inputClass}
                        {...register(`options.${index}.emoji`)}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
            {errors.options?.root?.message && (
              <p role="alert" className="text-[13px] text-flame">
                {errors.options.root.message}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              disabled={fields.length >= ROLE_PANEL_LIMITS.options}
              onClick={() => append(emptyOption)}
            >
              <Icon name="plus" className="size-4" />
              Ajouter un rôle
            </Button>
          </fieldset>
        </Panel>

        <FormActions
          submitLabel="Enregistrer et publier"
          submittingLabel="Enregistrement…"
          isSubmitting={isSubmitting}
          error={errors.root?.server?.message}
          idle="Publié sur Discord dès l'enregistrement."
          secondary={
            onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Annuler
              </Button>
            )
          }
        />
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <PanelPreview values={values} roles={roles} />
      </div>
    </form>
  );
}
