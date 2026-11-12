import { zodResolver } from '@hookform/resolvers/zod';
import {
  WELCOME_DEFAULTS,
  WELCOME_LIMITS,
  WELCOME_VARIABLES,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type WelcomeSettings,
} from '@phenix/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { Switch } from '../../../components/ui/switch';
import { ChannelOptions } from '../form-parts';
import { toFormValues, welcomeFormSchema, type WelcomeFormInput } from './form-values';

interface Props {
  config: WelcomeSettings;
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  /** Administrateur, ou délégué qui a aussi l'onglet Rôles : seul lui peut changer le rôle d'arrivée */
  canChooseRole: boolean;
  onSubmit: (settings: WelcomeSettings) => Promise<unknown>;
}

/** Les variables utilisables dans un message, rappelées sous chaque zone de texte. */
function VariableList() {
  return (
    <>
      Variables :{' '}
      {WELCOME_VARIABLES.map((name) => (
        <code key={name} className="mr-1.5 rounded bg-white/8 px-1.5 py-0.5 text-stone-200">
          {`{${name}}`}
        </code>
      ))}
    </>
  );
}

/** Le formulaire seul : il reçoit ses données et ne sait rien de l'API. */
export function WelcomeSettingsForm({ config, channels, roles, canChooseRole, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<WelcomeFormInput, unknown, WelcomeSettings>({
    resolver: zodResolver(welcomeFormSchema),
    defaultValues: toFormValues(config),
  });

  const [welcomeMessage, goodbyeMessage] = useWatch({
    control,
    name: ['welcomeMessage', 'goodbyeMessage'],
  });

  const save = async (values: WelcomeSettings) => {
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
        icon="users"
        title="Nouveaux membres"
        description="Indépendant du message d’arrivée : choisir un rôle suffit à l’activer."
      >
        <Field
          id="welcomeRoleId"
          label="Rôle d’arrivée"
          hint={
            canChooseRole
              ? 'Donné automatiquement à chaque nouveau membre, une fois la vérification de Discord passée. Choisis « Aucun rôle » pour ne rien donner. Les rôles que le bot ne peut pas donner sont grisés.'
              : 'Seul un administrateur, ou un accès à l’onglet Rôles, peut changer le rôle d’arrivée.'
          }
          error={errors.welcomeRoleId?.message}
        >
          <select
            id="welcomeRoleId"
            className={inputClass}
            disabled={!canChooseRole}
            {...register('welcomeRoleId')}
          >
            <option value="">Aucun rôle</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id} disabled={!role.assignable}>
                {role.name}
                {role.blockedReason ? ` — ${role.blockedReason}` : ''}
              </option>
            ))}
          </select>
        </Field>
      </Panel>

      <Panel
        icon="users"
        title="Arrivées"
        description="Le bot accueille chaque nouveau membre dans un salon."
      >
        <Switch
          id="welcomeEnabled"
          label="Envoyer un message d’arrivée"
          hint="Désactivé, aucun message d’arrivée n’est envoyé."
          {...register('welcomeEnabled')}
        />
        <div className="flex flex-col gap-4 border-t border-white/6 pt-6">
          <Field
            id="welcomeChannelId"
            label="Salon des messages d’arrivée"
            error={errors.welcomeChannelId?.message}
          >
            <select id="welcomeChannelId" className={inputClass} {...register('welcomeChannelId')}>
              <ChannelOptions channels={channels} empty="Choisis un salon" />
            </select>
          </Field>
          <Field
            id="welcomeMessage"
            label="Message d’arrivée"
            hint={<VariableList />}
            error={errors.welcomeMessage?.message}
          >
            <textarea
              id="welcomeMessage"
              rows={4}
              maxLength={WELCOME_LIMITS.messageMax}
              placeholder={WELCOME_DEFAULTS.welcomeMessage}
              className={inputClass}
              {...register('welcomeMessage')}
            />
            <Counter value={welcomeMessage} />
          </Field>
        </div>
      </Panel>

      <Panel
        icon="bell"
        title="Départs"
        description="Le bot prévient quand un membre quitte le serveur, ou en est exclu."
      >
        <Switch
          id="goodbyeEnabled"
          label="Envoyer un message de départ"
          hint="Aucun membre n’est mentionné dans ce message."
          {...register('goodbyeEnabled')}
        />
        <div className="flex flex-col gap-4 border-t border-white/6 pt-6">
          <Field
            id="goodbyeChannelId"
            label="Salon des messages de départ"
            error={errors.goodbyeChannelId?.message}
          >
            <select id="goodbyeChannelId" className={inputClass} {...register('goodbyeChannelId')}>
              <ChannelOptions channels={channels} empty="Choisis un salon" />
            </select>
          </Field>
          <Field
            id="goodbyeMessage"
            label="Message de départ"
            hint={<VariableList />}
            error={errors.goodbyeMessage?.message}
          >
            <textarea
              id="goodbyeMessage"
              rows={4}
              maxLength={WELCOME_LIMITS.messageMax}
              placeholder={WELCOME_DEFAULTS.goodbyeMessage}
              className={inputClass}
              {...register('goodbyeMessage')}
            />
            <Counter value={goodbyeMessage} />
          </Field>
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
        idle="Message vide : le texte par défaut est utilisé."
      />
    </form>
  );
}

/** « 12 / 1000 », sous la zone de texte. */
function Counter({ value }: { value: unknown }) {
  const length = typeof value === 'string' ? value.length : 0;
  return (
    <p className="text-right text-[13px] text-stone-400">
      {length} / {WELCOME_LIMITS.messageMax}
    </p>
  );
}
