import { zodResolver } from '@hookform/resolvers/zod';
import type {
  GuildCategorySummary,
  GuildChannelSummary,
  GuildRoleSummary,
  TicketSettings,
  TicketSettingsInput,
} from '@phenix/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Field, inputClass } from '../../../components/ui/field';
import { FormActions } from '../../../components/ui/form-actions';
import { Panel } from '../../../components/ui/panel';
import { ChannelOptions, RoleChecklist } from '../form-parts';
import { ticketFormSchema, toFormValues, type TicketFormInput } from './form-values';
import { TicketPanelPreview } from './ticket-panel-preview';

interface Props {
  settings: TicketSettings | null;
  categories: GuildCategorySummary[];
  channels: GuildChannelSummary[];
  roles: GuildRoleSummary[];
  onSubmit: (input: TicketSettingsInput) => Promise<unknown>;
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
          title="Salons privés"
          description="Chaque ticket devient un salon visible du membre et de l’équipe seulement."
        >
          <Field
            id="categoryId"
            label="Catégorie des tickets"
            hint="Les salons des tickets y sont créés. Le bot doit pouvoir y gérer les salons."
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
          icon="users"
          title="Équipe"
          description="Ces rôles voient tous les tickets, y répondent et peuvent les fermer."
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Équipe des tickets</legend>
            <RoleChecklist roles={roles} registration={register('staffRoleIds')} />
            {errors.staffRoleIds && (
              <p role="alert" className="text-[13px] text-flame">
                {errors.staffRoleIds.message}
              </p>
            )}
          </fieldset>
        </Panel>

        <Panel
          icon="ticket"
          title="Panel « Ouvrir un ticket »"
          description="Le message que le bot publie, avec le bouton qui ouvre un ticket."
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
