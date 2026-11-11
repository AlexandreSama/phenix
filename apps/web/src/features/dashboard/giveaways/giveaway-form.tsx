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
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { ChannelOptions } from '../form-parts';
import { defaultGiveawayValues, giveawayFormSchema, type GiveawayFormInput } from './form-values';

interface Props {
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: GiveawayInput) => Promise<unknown>;
  /** « Annuler » : retour à la liste, sans rien créer */
  onCancel?: () => void;
  /** L'heure de référence : remplacée dans les tests */
  now?: () => Date;
}

/** Le formulaire « Nouveau giveaway ». Il reçoit ses données et ne sait rien de l'API. */
export function GiveawayForm({
  channels,
  roles,
  onSubmit,
  onCancel,
  now = () => new Date(),
}: Props) {
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
    <form onSubmit={handleSubmit(save)} noValidate className="flex max-w-3xl flex-col gap-6">
      <Panel
        icon="gift"
        title="Le lot"
        description="Ce qui est à gagner, et pour combien de membres."
      >
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_140px]">
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
          <Field id="winnersCount" label="Gagnants" error={errors.winnersCount?.message}>
            <input
              id="winnersCount"
              type="number"
              inputMode="numeric"
              min={1}
              max={GIVEAWAY_LIMITS.winners}
              className={inputClass}
              {...register('winnersCount', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        icon="clock"
        title="Publication et tirage"
        description="Où le bot le poste, et quand il tire au sort."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="channelId" label="Salon" error={errors.channelId?.message}>
            <select id="channelId" className={inputClass} {...register('channelId')}>
              <ChannelOptions channels={channels} empty="Choisis un salon" />
            </select>
          </Field>
          <Field
            id="endsAt"
            label="Fin"
            hint="À ton heure. Le tirage se fait tout seul à ce moment."
            error={errors.endsAt?.message}
          >
            <input
              id="endsAt"
              type="datetime-local"
              className={inputClass}
              {...register('endsAt')}
            />
          </Field>
        </div>
      </Panel>

      <Panel icon="lock" title="Participation" description="Qui peut cliquer pour participer.">
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
      </Panel>

      <FormActions
        submitLabel="Lancer le giveaway"
        submittingLabel="Création…"
        isSubmitting={isSubmitting}
        error={errors.root?.server?.message}
        idle="Le bot le publie dès que tu le lances."
        secondary={
          onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          )
        }
      />
    </form>
  );
}
