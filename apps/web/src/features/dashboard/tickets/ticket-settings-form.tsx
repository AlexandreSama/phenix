import { zodResolver } from '@hookform/resolvers/zod';
import type { GuildChannelSummary, TicketSettings, TicketSettingsInput } from '@phenix/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { ChannelOptions } from '../form-parts';
import { ticketFormSchema, toFormValues, type TicketFormInput } from './form-values';
import { TicketPanelPreview } from './ticket-panel-preview';

interface Props {
  settings: TicketSettings | null;
  channels: GuildChannelSummary[];
  onSubmit: (input: TicketSettingsInput) => Promise<unknown>;
}

/** Les réglages des tickets et leur panel, avec l'aperçu. Il reçoit ses données et ne sait rien de l'API. */
export function TicketSettingsForm({ settings, channels, onSubmit }: Props) {
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
  // Premier réglage : tout est à envoyer, même sans modification
  const firstSetup = settings === null;

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
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Panel
          icon="lock"
          title="Journal"
          description="La catégorie des salons et l’équipe se règlent dans chaque type de ticket."
        >
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
        </Panel>

        <Panel
          icon="ticket"
          title="Panel « Ouvrir un ticket »"
          description="Le message que le bot publie : un seul bouton. Le membre y choisit le type de ticket, puis répond à ses questions."
        >
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
            hint="Le texte du bouton sous le message du panel."
            error={errors.panel?.buttonLabel?.message}
          >
            <input
              id="panelButtonLabel"
              className={inputClass}
              {...register('panel.buttonLabel')}
            />
          </Field>
        </Panel>

        <FormActions
          submitLabel="Enregistrer et publier"
          submittingLabel="Enregistrement…"
          isSubmitting={isSubmitting}
          canSubmit={firstSetup || isDirty}
          dirty={!firstSetup && isDirty}
          onReset={() => reset()}
          error={errors.root?.server?.message}
          idle={
            firstSetup
              ? 'Le bot publie le panel dès l’enregistrement.'
              : 'Chaque enregistrement met le panel à jour sur Discord.'
          }
        />
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <TicketPanelPreview
          title={panel.title}
          description={typeof panel.description === 'string' ? panel.description : ''}
          buttonLabel={panel.buttonLabel}
        />
      </div>
    </form>
  );
}
