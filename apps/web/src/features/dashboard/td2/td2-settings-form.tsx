import { zodResolver } from '@hookform/resolvers/zod';
import {
  td2PublicListingRule,
  td2SettingsFields,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type Td2Settings,
  type Td2SettingsInput,
} from '@phenix/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { Switch } from '../../../components/ui/switch';
import { ChannelOptions, RoleChecklist } from '../form-parts';

/** Un <select> laissé sur l'option vide envoie '' ; l'API attend null. */
const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema);

/** Une seule case cochée, react-hook-form donne une chaîne ; aucune, false : on veut un tableau. */
const asArray = (value: unknown) =>
  Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

// Les champs adaptés au formulaire, puis la règle partagée (page publique ⇒ salon des sorties)
const formSchema = td2PublicListingRule(
  td2SettingsFields.extend({
    channelId: emptyToNull(td2SettingsFields.shape.channelId),
    reportChannelId: emptyToNull(td2SettingsFields.shape.reportChannelId),
    reportViewerRoleIds: z.preprocess(asArray, td2SettingsFields.shape.reportViewerRoleIds),
    reportFeedChannelId: emptyToNull(td2SettingsFields.shape.reportFeedChannelId),
  }),
);
type FormInput = z.input<typeof formSchema>;

const toForm = (settings: Td2Settings): FormInput => ({
  channelId: settings.channelId ?? '',
  publicListing: settings.publicListing,
  reportChannelId: settings.reportChannelId ?? '',
  reportViewerRoleIds: settings.reportViewerRoleIds,
  reportFeedChannelId: settings.reportFeedChannelId ?? '',
});

interface Props {
  settings: Td2Settings;
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: Td2SettingsInput) => Promise<unknown>;
}

const command = (name: string) => (
  <code className="rounded bg-white/6 px-1 py-0.5 font-mono text-[0.9em] text-stone-200">
    {name}
  </code>
);

export function Td2SettingsForm({ settings, channels, roles, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormInput, unknown, Td2SettingsInput>({
    resolver: zodResolver(formSchema),
    defaultValues: toForm(settings),
  });

  const save = async (input: Td2SettingsInput) => {
    try {
      await onSubmit(input);
      reset(toForm(input), { keepIsSubmitSuccessful: true });
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(save)} noValidate className="flex flex-col gap-6">
      <Panel
        icon="hash"
        title="Sorties"
        description={
          <>
            Où le bot poste les raids, incursions et missions créés avec {command('/td2')}, et qui
            peut les voir.
          </>
        }
      >
        <Field
          id="td2ChannelId"
          label="Salon des sorties"
          hint="Les horaires suivent le fuseau de l’onglet Général."
          error={errors.channelId?.message}
        >
          <select id="td2ChannelId" className={inputClass} {...register('channelId')}>
            <ChannelOptions channels={channels} empty="Là où la commande est lancée" />
          </select>
        </Field>

        <div className="flex flex-col gap-2 border-t border-white/6 pt-5">
          <Switch
            id="td2PublicListing"
            label="Afficher sur la page publique"
            hint="Les sorties de ce serveur apparaissent sur la page Sorties du site, avec un bouton « Rejoindre ce serveur ». Le bot crée l’invitation dans le salon des sorties : il lui faut la permission « Créer une invitation »."
            aria-invalid={errors.publicListing ? true : undefined}
            {...register('publicListing')}
          />
          {errors.publicListing && (
            <p role="alert" className="text-[13px] text-flame">
              {errors.publicListing.message}
            </p>
          )}
        </div>
      </Panel>

      <Panel
        icon="flag"
        title="Signalements"
        description={
          <>
            Un membre signale un joueur avec {command('/td2 signaler')}. Le staff l’examine dans son
            salon ; une fois confirmé, il part dans le fil de chaque serveur du réseau.
          </>
        }
      >
        <Field
          id="td2ReportChannelId"
          label="Salon du staff"
          hint="Reçoit les signalements faits sur ce serveur, avec leurs captures. Sans salon, /td2 signaler est fermé ici."
          error={errors.reportChannelId?.message}
        >
          <select id="td2ReportChannelId" className={inputClass} {...register('reportChannelId')}>
            <ChannelOptions channels={channels} empty="Aucun : signalements fermés" />
          </select>
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-stone-100">Rôles qui consultent</legend>
          <p className="-mt-1 text-[13px] leading-relaxed text-stone-400">
            Peuvent lancer {command('/td2 signalements')}, en plus des rôles staff de l’onglet
            Général. Seul le staff examine.
          </p>
          <RoleChecklist roles={roles} registration={register('reportViewerRoleIds')} />
          {errors.reportViewerRoleIds && (
            <p role="alert" className="text-[13px] text-flame">
              {errors.reportViewerRoleIds.message}
            </p>
          )}
        </fieldset>

        <Field
          id="td2ReportFeedChannelId"
          label="Fil du réseau"
          hint="Reçoit les signalements confirmés par le staff de tous les serveurs du bot."
          error={errors.reportFeedChannelId?.message}
        >
          <select
            id="td2ReportFeedChannelId"
            className={inputClass}
            {...register('reportFeedChannelId')}
          >
            <ChannelOptions channels={channels} empty="Aucun fil" />
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
        success={
          isSubmitSuccessful && 'Enregistré. Le bot applique les nouveaux réglages tout de suite.'
        }
        error={errors.root?.server?.message}
        idle="Les changements s'appliquent sans redémarrer le bot."
      />
    </form>
  );
}
