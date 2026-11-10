import { zodResolver } from '@hookform/resolvers/zod';
import {
  td2SettingsSchema,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type Td2Settings,
  type Td2SettingsInput,
} from '@phenix/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';

/** Un <select> laissé sur l'option vide envoie '' ; l'API attend null. */
const emptyToNull = <T extends z.ZodType>(schema: T) =>
    z.preprocess((value) => (value === '' ? null : value), schema);

/** Une seule case cochée, react-hook-form donne une chaîne ; aucune, false : on veut un tableau. */
const asArray = (value: unknown) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

const formSchema = td2SettingsSchema.extend({
  channelId: emptyToNull(td2SettingsSchema.shape.channelId),
  reportChannelId: emptyToNull(td2SettingsSchema.shape.reportChannelId),
  reportViewerRoleIds: z.preprocess(asArray, td2SettingsSchema.shape.reportViewerRoleIds),
  reportFeedChannelId: emptyToNull(td2SettingsSchema.shape.reportFeedChannelId),
});
type FormInput = z.input<typeof formSchema>;

const toForm = (settings: Td2Settings): FormInput => ({
  channelId: settings.channelId ?? '',
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

function ChannelOptions({ channels, empty }: { channels: GuildChannelSummary[]; empty: string }) {
  return (
      <>
        <option value="">{empty}</option>
        {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
              {channel.parentName ? ` (${channel.parentName})` : ''}
            </option>
        ))}
      </>
  );
}

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
        <Field
            id="td2ChannelId"
            label="Salon des sorties"
            hint="Où le bot poste les raids et incursions créés avec /td2. Les horaires suivent le fuseau de l’onglet Général."
            error={errors.channelId?.message}
        >
          <select id="td2ChannelId" className={inputClass} {...register('channelId')}>
            <ChannelOptions channels={channels} empty="Là où la commande est lancée" />
          </select>
        </Field>

        <fieldset className="flex flex-col gap-4 border-t border-brown pt-4">
          <legend className="text-base font-semibold text-white">Signalements</legend>
          <p className="text-sm text-stone-400">
            Un membre signale un joueur avec <code>/td2 signaler</code>. L’équipe l’examine dans son
            salon ; une fois confirmé, il part dans le fil de chaque serveur du réseau.
          </p>

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

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">Rôles qui consultent</legend>
            <p className="text-xs text-stone-400">
              Peuvent lancer <code>/td2 signalements</code>, en plus des rôles staff de l’onglet
              Général. Seul le staff examine.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" value={role.id} {...register('reportViewerRoleIds')} />
                    <span style={{ color: role.color ?? undefined }}>{role.name}</span>
                  </label>
              ))}
            </div>
            {errors.reportViewerRoleIds && (
                <p role="alert" className="text-xs text-flame">
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
        </fieldset>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          {isSubmitSuccessful && !isDirty && (
              <p role="status" className="text-sm text-gold">
                Enregistré. Le bot applique les nouveaux réglages tout de suite.
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