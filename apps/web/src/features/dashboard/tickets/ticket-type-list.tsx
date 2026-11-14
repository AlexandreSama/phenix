import { TICKET_LIMITS, type TicketTypeSummary } from '@phenix/shared';
import { useState, type ReactNode } from 'react';
import { Icon } from '../../../components/icon';
import { inactivityLabel } from './type-form-values';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';

interface Props {
  types: TicketTypeSummary[];
  /** Le lien « Modifier » : il arrive du parent, qui connaît le routeur */
  edit: (type: TicketTypeSummary) => ReactNode;
  /** Le bouton « Ajouter un type » ; la liste le grise à 25 types */
  add: ReactNode;
  onDelete: (typeId: number) => Promise<unknown>;
}

const questionsLabel = (count: number) =>
  count === 0 ? 'aucune question' : `${count} ${count > 1 ? 'questions' : 'question'}`;

function TypeRow({
  type,
  edit,
  onDelete,
}: Pick<Props, 'edit' | 'onDelete'> & { type: TicketTypeSummary }) {
  // Supprimer demande un second clic : pas de fenêtre de confirmation qui bloque la page
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-4 py-3 ${
        confirming ? 'border-flame/50' : 'border-white/8'
      }`}
    >
      <span className="w-6 text-center text-lg">
        {type.emoji ?? <Icon name="ticket" className="mx-auto size-4 text-stone-500" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-white">{type.name}</span>
        <span className="text-sm text-stone-400">{questionsLabel(type.questionCount)}</span>
        {type.inactivityHours !== null && (
          <span className="text-sm text-stone-400">
            Fermeture automatique après {inactivityLabel(type.inactivityHours)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                // Le refus (ticket ouvert) s'affiche au-dessus de la liste : la confirmation se referme
                void Promise.resolve(onDelete(type.id))
                  .catch(() => undefined)
                  .finally(() => setConfirming(false));
              }}
            >
              Confirmer la suppression
            </Button>
          </>
        ) : (
          <>
            {edit(type)}
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Icon name="trash" className="size-4" />
              Supprimer <span className="sr-only">{type.name}</span>
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Les types de ticket du serveur : nom, emoji, questions, et la limite de 25. */
export function TicketTypeList({ types, edit, add, onDelete }: Props) {
  if (types.length === 0) {
    return (
      <EmptyState icon="ticket" title="Aucun type de ticket pour l’instant" action={add}>
        Crée le premier : le membre le choisit après avoir cliqué sur le bouton du panel, et le bot
        ouvre un salon dans la catégorie choisie.
      </EmptyState>
    );
  }
  const full = types.length >= TICKET_LIMITS.types;

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Types de ticket" className="flex flex-col gap-3">
        {types.map((type) => (
          <TypeRow key={type.id} type={type} edit={edit} onDelete={onDelete} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-400">
          {types.length} / {TICKET_LIMITS.types} types
          {full && ' : supprime-en un pour en créer un autre.'}
        </p>
        <span aria-disabled={full} className={full ? 'pointer-events-none opacity-50' : ''}>
          {add}
        </span>
      </div>
    </div>
  );
}
