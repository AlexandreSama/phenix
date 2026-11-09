import { zodResolver } from '@hookform/resolvers/zod';
import {
  GIVEAWAY_LIMITS,
  type GiveawayInput,
  type GuildChannelSummary,
  type GuildRoleSummary,
} from '@phenix/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import { defaultGiveawayValues, giveawayFormSchema, type GiveawayFormInput } from './form-values';

interface Props {
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: GiveawayInput) => Promise<unknown>;
  /** L'heure de référence : remplacée dans les tests */
  now?: () => Date;
}

/** Le formulaire « Nouveau giveaway ». Il reçoit ses données et ne sait rien de l'API. */
export function GiveawayForm({ channels, roles, onSubmit, now = () => new Date() }: Props) {
  // Créé une fois : le schéma garde la même horloge pendant toute la vie du formulaire
  const [schema] = useState(() => giveawayFormSchema(now));
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GiveawayFormInput, unknown, GiveawayInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultGiveawayValues(now()),
  });

  const save = async (input: GiveawayInput) => {
    try {
      await onSubmit(input);
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Création impossible',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(save)} noValidate className="flex max-w-xl flex-col gap-6">
      <Field
        id="prize"
        label="Lot"
        hint="Ce que les gagnants remportent."
        error={errors.prize?.message}
      >
        <input
          id="prize"
          className={inputClass}
          maxLength={GIVEAWAY_LIMITS.prize}
          {...register('prize')}
        />
      </Field>

      <Field id="channelId" label="Salon" error={errors.channelId?.message}>
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

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="winnersCount" label="Gagnants" error={errors.winnersCount?.message}>
          <input
            id="winnersCount"
            type="number"
            min={1}
            max={GIVEAWAY_LIMITS.winners}
            className={inputClass}
            {...register('winnersCount', { valueAsNumber: true })}
          />
        </Field>
        <Field
          id="endsAt"
          label="Fin"
          hint="À ton heure. Le tirage se fait tout seul à ce moment."
          error={errors.endsAt?.message}
        >
          <input id="endsAt" type="datetime-local" className={inputClass} {...register('endsAt')} />
        </Field>
      </div>

      <Field
        id="requiredRoleId"
        label="Réservé à un rôle"
        hint="Facultatif. Seuls les membres qui ont ce rôle pourront participer."
        error={errors.requiredRoleId?.message}
      >
        <select id="requiredRoleId" className={inputClass} {...register('requiredRoleId')}>
          <option value="">Tout le monde</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Création…' : 'Lancer le giveaway'}
        </Button>
      </div>
      {errors.root?.server && (
        <p role="alert" className="text-sm text-flame">
          {errors.root.server.message}
        </p>
      )}
    </form>
  );
}
