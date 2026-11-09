import { zodResolver } from '@hookform/resolvers/zod';
import {
  ROLE_PANEL_LIMITS,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type RolePanelInput,
} from '@phenix/shared';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import { emptyOption, rolePanelFormSchema, type RolePanelFormInput } from './form-values';
import { PanelPreview } from './panel-preview';

interface Props {
  defaultValues: RolePanelFormInput;
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: RolePanelInput) => Promise<unknown>;
}

const MODES = [
  { value: 'MULTIPLE', label: 'Plusieurs rôles', hint: 'Chaque bouton ajoute ou retire son rôle.' },
  { value: 'UNIQUE', label: 'Un seul rôle', hint: 'Prendre un rôle retire les autres du panel.' },
] as const;

const smallButton =
  'rounded-md border border-brown px-2 py-1 text-xs text-stone-300 hover:border-ember hover:text-white disabled:opacity-30';

/** Le formulaire d'un panel, avec l'aperçu du message à côté. Il ne sait rien de l'API. */
export function RolePanelForm({ defaultValues, channels, roles, onSubmit }: Props) {
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
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="flex flex-col gap-6">
        <Field id="title" label="Titre" error={errors.title?.message}>
          <input id="title" className={inputClass} {...register('title')} />
        </Field>
        <Field
          id="description"
          label="Description"
          hint="Facultative. Explique à quoi servent les rôles."
          error={errors.description?.message}
        >
          <textarea id="description" rows={3} className={inputClass} {...register('description')} />
        </Field>
        <Field id="channelId" label="Salon du panel" error={errors.channelId?.message}>
          <select id="channelId" className={inputClass} {...register('channelId')}>
            <option value="">Choisis un salon</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
                {channel.parentName ? ` (${channel.parentName})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-stone-100">Mode</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODES.map((mode) => (
              <label
                key={mode.value}
                className="flex cursor-pointer gap-3 rounded-lg border border-brown p-3 has-checked:border-flame"
              >
                <input
                  type="radio"
                  value={mode.value}
                  className="mt-1 accent-flame"
                  {...register('mode')}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-stone-100">{mode.label}</span>
                  <span className="text-xs text-stone-400">{mode.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 text-sm font-semibold text-stone-100">
            Boutons ({fields.length} / {ROLE_PANEL_LIMITS.options})
          </legend>
          {fields.map((field, index) => {
            const optionErrors = errors.options?.[index];
            const roleField = register(`options.${index}.roleId`);
            return (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border border-brown p-3"
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px]">
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
                          setValue(`options.${index}.label`, role.name, { shouldValidate: true });
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={smallButton}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    aria-label={`Monter le rôle ${index + 1}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label={`Descendre le rôle ${index + 1}`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${smallButton} ml-auto`}
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    Retirer
                  </button>
                </div>
              </div>
            );
          })}
          {errors.options?.root?.message && (
            <p role="alert" className="text-xs text-flame">
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
            + Ajouter un rôle
          </Button>
        </fieldset>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer et publier'}
          </Button>
        </div>
        {errors.root?.server && (
          <p role="alert" className="text-sm text-flame">
            {errors.root.server.message}
          </p>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <PanelPreview values={values} roles={roles} />
      </div>
    </form>
  );
}
