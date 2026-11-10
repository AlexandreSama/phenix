import { zodResolver } from '@hookform/resolvers/zod';
import {
  td2SettingsSchema,
  type GuildChannelSummary,
  type Td2Settings,
  type Td2SettingsInput,
} from '@phenix/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';

/** « Là où la commande est lancée » vaut une chaîne vide ; l'API attend null. */
const formSchema = td2SettingsSchema.extend({
  channelId: z.preprocess(
    (value) => (value === '' ? null : value),
    td2SettingsSchema.shape.channelId,
  ),
});
type FormInput = z.input<typeof formSchema>;

interface Props {
  settings: Td2Settings;
  channels: GuildChannelSummary[];
  onSubmit: (input: Td2SettingsInput) => Promise<unknown>;
}

export function Td2SettingsForm({ settings, channels, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormInput, unknown, Td2SettingsInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { channelId: settings.channelId ?? '' },
  });

  const save = async (input: Td2SettingsInput) => {
    try {
      await onSubmit(input);
      reset({ channelId: input.channelId ?? '' }, { keepIsSubmitSuccessful: true });
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(save)} noValidate className="flex flex-col gap-4">
      <Field
        id="td2ChannelId"
        label="Salon des sorties"
        hint="Où le bot poste les raids et incursions créés avec /td2. Les horaires suivent le fuseau de l’onglet Général."
        error={errors.channelId?.message}
      >
        <select id="td2ChannelId" className={inputClass} {...register('channelId')}>
          <option value="">Là où la commande est lancée</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
              {channel.parentName ? ` (${channel.parentName})` : ''}
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
            Enregistré. Les prochaines sorties y seront postées.
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
