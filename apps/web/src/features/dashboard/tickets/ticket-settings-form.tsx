import { zodResolver } from '@hookform/resolvers/zod';
import type {
  GuildCategorySummary,
  GuildChannelSummary,
  GuildRoleSummary,
  TicketSettings,
  TicketSettingsInput,
} from '@phenix/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import { ticketFormSchema, toFormValues, type TicketFormInput } from './form-values';
import { TicketPanelPreview } from './ticket-panel-preview';

interface Props {
  settings: TicketSettings | null;
  categories: GuildCategorySummary[];
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: TicketSettingsInput) => Promise<unknown>;
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

/** Les réglages des tickets et leur panel, avec l'aperçu. Il reçoit ses données et ne sait rien de l'API. */
export function TicketSettingsForm({ settings, categories, channels, roles, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TicketFormInput, unknown, TicketSettingsInput>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: toFormValues(settings),
  });
  const panel = useWatch({ control, name: 'panel' });

  const save = async (input: TicketSettingsInput) => {
    try {
      await onSubmit(input);
      reset(toFormValues({ ...input, panelStatus: 'pending', panelError: null }));
    } catch (error) {
      setError('root.server', {
        message: error instanceof Error ? error.message : 'Enregistrement impossible',
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(save)}
      noValidate
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="flex flex-col gap-6">
        <Field
          id="categoryId"
          label="Catégorie des tickets"
          hint="Chaque ticket y devient un salon privé. Le bot doit pouvoir y gérer les salons."
          error={errors.categoryId?.message}
        >
          <select id="categoryId" className={inputClass} {...register('categoryId')}>
            <option value="">Choisis une catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-stone-100">Équipe des tickets</legend>
          <p className="text-xs text-stone-400">
            Ces rôles voient tous les tickets, y répondent et peuvent les fermer.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={role.id}
                  className="accent-flame"
                  {...register('staffRoleIds')}
                />
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
          id="logChannelId"
          label="Salon de logs des tickets"
          hint="Facultatif. Un résumé y est posté à chaque fermeture, avec le lien du transcript."
          error={errors.logChannelId?.message}
        >
          <select id="logChannelId" className={inputClass} {...register('logChannelId')}>
            <ChannelOptions channels={channels} empty="Aucun" />
          </select>
        </Field>

        <fieldset className="flex flex-col gap-4 rounded-lg border border-brown p-4">
          <legend className="px-1 text-sm font-semibold text-stone-100">
            Panel « Ouvrir un ticket »
          </legend>
          <Field
            id="panelChannelId"
            label="Salon du panel"
            error={errors.panel?.channelId?.message}
          >
            <select id="panelChannelId" className={inputClass} {...register('panel.channelId')}>
              <ChannelOptions channels={channels} empty="Choisis un salon" />
            </select>
          </Field>
          <Field id="panelTitle" label="Titre" error={errors.panel?.title?.message}>
            <input id="panelTitle" className={inputClass} {...register('panel.title')} />
          </Field>
          <Field
            id="panelDescription"
            label="Description"
            hint="Facultative."
            error={errors.panel?.description?.message}
          >
            <textarea
              id="panelDescription"
              rows={3}
              className={inputClass}
              {...register('panel.description')}
            />
          </Field>
          <Field
            id="panelButtonLabel"
            label="Texte du bouton"
            error={errors.panel?.buttonLabel?.message}
          >
            <input
              id="panelButtonLabel"
              className={inputClass}
              {...register('panel.buttonLabel')}
            />
          </Field>
        </fieldset>

        <div>
          <Button type="submit" disabled={isSubmitting || (settings !== null && !isDirty)}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer et publier'}
          </Button>
        </div>
        {errors.root?.server && (
          <p role="alert" className="text-sm text-flame">
            {errors.root.server.message}
          </p>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <TicketPanelPreview
          title={panel.title}
          description={typeof panel.description === 'string' ? panel.description : ''}
          buttonLabel={panel.buttonLabel}
        />
      </div>
    </form>
  );
}
