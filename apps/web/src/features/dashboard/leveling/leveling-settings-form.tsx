import { zodResolver } from '@hookform/resolvers/zod';
import type { GuildChannelSummary, LevelingConfig } from '@phenix/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Icon } from '../../../components/icon';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { Switch } from '../../../components/ui/switch';
import { ChannelOptions } from '../form-parts';
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
  const [xpEnabled, xpMin, xpMax, cooldown, isPublic] = useWatch({
    control,
    name: ['xpEnabled', 'xpMin', 'xpMax', 'xpCooldownSec', 'leaderboardPublic'],
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
      <Panel
        icon="chart"
        title="Gain d'XP"
        description="Ce qu'un message rapporte, et le délai avant qu'un autre compte."
      >
        <Switch
          id="xpEnabled"
          label="Gagner de l'XP en discutant"
          hint="Désactivé, plus personne ne gagne d'XP ; le classement reste visible."
          {...register('xpEnabled')}
        />

        {/* Les valeurs restent modifiables XP coupée : on prépare la reprise */}
        <div
          className={`grid gap-4 border-t border-white/6 pt-6 transition-opacity sm:grid-cols-3 ${xpEnabled ? '' : 'opacity-60'}`}
        >
          <Field id="xpMin" label="XP minimum par message" error={errors.xpMin?.message}>
            <input
              id="xpMin"
              type="number"
              inputMode="numeric"
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
              inputMode="numeric"
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
              inputMode="numeric"
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
            className="flex items-start gap-3 rounded-xl bg-white/4 px-4 py-3.5 text-sm text-stone-300"
          >
            <Icon name="trophy" className="mt-0.5 size-4.5 text-gold" />
            <span>
              Avec ces réglages, un membre atteint le{' '}
              <strong className="font-semibold text-white">niveau {TARGET_LEVEL}</strong> en environ{' '}
              <strong className="font-semibold text-white">
                {estimate.messages.toLocaleString('fr-FR')} messages
              </strong>
              , soit au moins {formatMinutes(estimate.minutes)} de discussion.
            </span>
          </p>
        )}
      </Panel>

      <Panel
        icon="bell"
        title="Annonces de niveau"
        description="Le bot félicite chaque membre qui monte de niveau."
      >
        <Field
          id="levelUpChannelId"
          label="Salon des annonces de niveau"
          hint="Par défaut, la félicitation arrive dans le salon où le membre vient d'écrire."
          error={errors.levelUpChannelId?.message}
        >
          <select id="levelUpChannelId" className={inputClass} {...register('levelUpChannelId')}>
            <ChannelOptions channels={channels} empty="Dans le salon où le membre a écrit" />
          </select>
        </Field>
      </Panel>

      <Panel
        icon="trophy"
        title="Classement"
        description="Les membres les plus actifs, sur Discord avec /leaderboard et sur le site."
      >
        <div className="flex flex-col gap-3">
          <Switch
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
              className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-gold hover:underline"
            >
              Voir le classement public
              <Icon name="external" className="size-3.5" />
            </a>
          )}
        </div>
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
