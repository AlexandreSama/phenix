import { zodResolver } from '@hookform/resolvers/zod';
import type { GeneralConfig, GuildChannelSummary, GuildRoleSummary } from '@phenix/shared';
import { useForm } from 'react-hook-form';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { ChannelOptions, RoleChecklist } from '../form-parts';
import { generalFormSchema, TIMEZONES, toFormValues, type GeneralFormInput } from './form-values';

interface Props {
  config: GeneralConfig;
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (config: GeneralConfig) => Promise<unknown>;
}

/** Le formulaire seul : il reçoit ses données et ne sait rien de l'API, donc il se teste facilement. */
export function GeneralSettingsForm({ config, channels, roles, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<GeneralFormInput, unknown, GeneralConfig>({
    resolver: zodResolver(generalFormSchema),
    defaultValues: toFormValues(config),
  });

  const save = async (values: GeneralConfig) => {
    try {
      await onSubmit(values);
      // Les valeurs enregistrées deviennent la nouvelle référence du formulaire
      reset(toFormValues(values), { keepIsSubmitSuccessful: true });
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      });
    }
  };
  const timezones = TIMEZONES.includes(config.timezone)
    ? TIMEZONES
    : [config.timezone, ...TIMEZONES];

  return (
    <form onSubmit={handleSubmit(save)} className="flex flex-col gap-6" noValidate>
      <Panel
        icon="hash"
        title="Salons du bot"
        description="Là où le bot écrit de lui-même, sans qu'on lui demande."
      >
        <Field
          id="modLogChannelId"
          label="Salon de logs de modération"
          hint="Chaque sanction y est publiée. Pris en compte par le bot immédiatement."
          error={errors.modLogChannelId?.message}
        >
          <select id="modLogChannelId" className={inputClass} {...register('modLogChannelId')}>
            <ChannelOptions channels={channels} empty="Aucun" />
          </select>
        </Field>

        <Field
          id="announceChannelId"
          label="Salon d'annonces"
          hint="Reçoit les annonces /broadcast du bot. Sans salon, aucune annonce."
          error={errors.announceChannelId?.message}
        >
          <select id="announceChannelId" className={inputClass} {...register('announceChannelId')}>
            <ChannelOptions channels={channels} empty="Aucun" />
          </select>
        </Field>
      </Panel>

      <Panel
        icon="shield"
        title="Rôles staff"
        description="Voient les signalements The Division 2 et les tickets."
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Rôles staff</legend>
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
        title="Horaires"
        description="L'heure à laquelle le bot affiche et planifie tout ce qui est daté."
      >
        <Field
          id="timezone"
          label="Fuseau horaire"
          hint="Sert aux horaires des raids et incursions."
          error={errors.timezone?.message}
        >
          <select id="timezone" className={inputClass} {...register('timezone')}>
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>
      </Panel>

      <FormActions
        submitLabel="Enregistrer"
        submittingLabel="Enregistrement…"
        isSubmitting={isSubmitting}
        canSubmit={isDirty}
        dirty={isDirty}
        onReset={() => reset()}
        success={isSubmitSuccessful && 'Enregistré. Le bot applique déjà le changement.'}
        error={errors.root?.server?.message}
        idle="Les changements s'appliquent sans redémarrer le bot."
      />
    </form>
  );
}
