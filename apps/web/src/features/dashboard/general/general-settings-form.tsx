import { zodResolver } from '@hookform/resolvers/zod';
import type { GeneralConfig, GuildChannelSummary, GuildRoleSummary } from '@phenix/shared';
import { useForm } from 'react-hook-form';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import { generalFormSchema, TIMEZONES, toFormValues, type GeneralFormInput } from './form-values';

interface Props {
  config: GeneralConfig;
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (config: GeneralConfig) => Promise<unknown>;
}

function ChannelOptions({ channels }: { channels: GuildChannelSummary[] }) {
  return (
    <>
      <option value="">Aucun</option>
      {channels.map((channel) => (
        <option key={channel.id} value={channel.id}>
          #{channel.name}
          {channel.parentName ? ` (${channel.parentName})` : ''}
        </option>
      ))}
    </>
  );
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
      <Field
        id="modLogChannelId"
        label="Salon de logs de modération"
        hint="Chaque sanction y est publiée. Pris en compte par le bot immédiatement."
        error={errors.modLogChannelId?.message}
      >
        <select id="modLogChannelId" className={inputClass} {...register('modLogChannelId')}>
          <ChannelOptions channels={channels} />
        </select>
      </Field>

      <Field
        id="announceChannelId"
        label="Salon d'annonces"
        hint="Reçoit les annonces /broadcast du bot (phase 6). Sans salon, aucune annonce."
        error={errors.announceChannelId?.message}
      >
        <select id="announceChannelId" className={inputClass} {...register('announceChannelId')}>
          <ChannelOptions channels={channels} />
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Rôles staff</legend>
        <p className="text-xs text-stone-400">
          Voient les signalements The Division 2 et les tickets (phases 6 et 7).
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" value={role.id} {...register('staffRoleIds')} />
              <span style={{ color: role.color ?? undefined }}>{role.name}</span>
            </label>
          ))}
        </div>
        {errors.staffRoleIds && (
          <p role="alert" className="text-xs text-flame">
            {errors.staffRoleIds.message}
          </p>
        )}
      </fieldset>

      <Field
        id="timezone"
        label="Fuseau horaire"
        hint="Sert aux horaires des raids et incursions (phase 7)."
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

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {isSubmitSuccessful && !isDirty && (
          <p role="status" className="text-sm text-gold">
            Enregistré. Le bot applique déjà le changement.
          </p>
        )}
      </div>
      {errors.root?.server && (
        <p role="alert" className="text-sm text-flame">
          {errors.root.server.message}
        </p>
      )}
    </form>
  );
}
