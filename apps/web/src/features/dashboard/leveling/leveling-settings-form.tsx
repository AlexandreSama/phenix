import { zodResolver } from '@hookform/resolvers/zod';
import type { GuildChannelSummary, LevelingConfig } from '@phenix/shared';
import type { ComponentProps } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import {
  estimateLevel,
  formatMinutes,
  levelingFormSchema,
  toFormValues,
  type LevelingFormInput,
} from './form-values';

interface Props {
  guildId: string;
  config: LevelingConfig;
  channels: GuildChannelSummary[];
  onSubmit: (config: LevelingConfig) => Promise<unknown>;
}

/** Niveau pris comme repère dans l'estimation affichée sous les réglages. */
const TARGET_LEVEL = 10;

type ToggleProps = ComponentProps<'input'> & { id: string; label: string; hint: string };

/** Case à cocher avec son libellé et son aide. Reçoit tel quel le résultat de register(). */
function Toggle({ id, label, hint, ...input }: ToggleProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 size-4 accent-flame" {...input} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-stone-100">{label}</span>
        <span className="text-xs text-stone-400">{hint}</span>
      </span>
    </label>
  );
}

/** Le formulaire seul : il reçoit ses données et ne sait rien de l'API. */
export function LevelingSettingsForm({ guildId, config, channels, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<LevelingFormInput, unknown, LevelingConfig>({
    resolver: zodResolver(levelingFormSchema),
    defaultValues: toFormValues(config),
  });

  // L'estimation suit la saisie en direct
  const [xpMin, xpMax, cooldown, isPublic] = useWatch({
    control,
    name: ['xpMin', 'xpMax', 'xpCooldownSec', 'leaderboardPublic'],
  });
  const estimate = estimateLevel(TARGET_LEVEL, Number(xpMin), Number(xpMax), Number(cooldown));

  const save = async (values: LevelingConfig) => {
    try {
      await onSubmit(values);
      reset(toFormValues(values), { keepIsSubmitSuccessful: true });
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(save)} className="flex flex-col gap-6" noValidate>
      <Toggle
        id="xpEnabled"
        label="Gagner de l'XP en discutant"
        hint="Désactivé, plus personne ne gagne d'XP ; le classement reste visible."
        {...register('xpEnabled')}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="xpMin" label="XP minimum par message" error={errors.xpMin?.message}>
          <input
            id="xpMin"
            type="number"
            min={1}
            max={100}
            className={inputClass}
            {...register('xpMin', { valueAsNumber: true })}
          />
        </Field>
        <Field id="xpMax" label="XP maximum par message" error={errors.xpMax?.message}>
          <input
            id="xpMax"
            type="number"
            min={1}
            max={100}
            className={inputClass}
            {...register('xpMax', { valueAsNumber: true })}
          />
        </Field>
        <Field
          id="xpCooldownSec"
          label="Délai entre deux gains (s)"
          error={errors.xpCooldownSec?.message}
        >
          <input
            id="xpCooldownSec"
            type="number"
            min={0}
            max={3600}
            className={inputClass}
            {...register('xpCooldownSec', { valueAsNumber: true })}
          />
        </Field>
      </div>

      {estimate && (
        <p
          aria-live="polite"
          className="rounded-lg border border-brown px-4 py-3 text-sm text-stone-300"
        >
          Avec ces réglages, un membre atteint le <strong>niveau {TARGET_LEVEL}</strong> en environ{' '}
          <strong>{estimate.messages.toLocaleString('fr-FR')} messages</strong>, soit au moins{' '}
          {formatMinutes(estimate.minutes)} de discussion.
        </p>
      )}

      <Field
        id="levelUpChannelId"
        label="Salon des annonces de niveau"
        hint="Le bot y félicite chaque membre qui monte de niveau."
        error={errors.levelUpChannelId?.message}
      >
        <select id="levelUpChannelId" className={inputClass} {...register('levelUpChannelId')}>
          <option value="">Dans le salon où le membre a écrit</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
              {channel.parentName ? ` (${channel.parentName})` : ''}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-2">
        <Toggle
          id="leaderboardPublic"
          label="Classement public sur le site"
          hint="Pseudos, avatars et niveaux visibles par tous, sans connexion."
          {...register('leaderboardPublic')}
        />
        {isPublic && config.leaderboardPublic && (
          // Un simple lien : la page s'ouvre dans un nouvel onglet, le formulaire reste ouvert
          <a
            href={`/classement/${guildId}`}
            target="_blank"
            rel="noreferrer"
            className="ml-7 text-sm text-gold underline"
          >
            Voir le classement public ↗
          </a>
        )}
      </div>

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
