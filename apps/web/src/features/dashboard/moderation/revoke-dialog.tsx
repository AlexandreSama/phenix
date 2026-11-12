import type { CaseSummary } from '@phenix/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, buttonClass } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';
import { useRevokeCase } from '../api';
import { REVOKE_LABELS } from './case-row';

const MAX_REASON = 512;

/** Ce que la levée change, dit avant de confirmer. */
const EFFECTS = {
  BAN: 'Le membre pourra de nouveau rejoindre le serveur.',
  MUTE: 'La sourdine est retirée sur Discord, le membre peut de nouveau écrire et parler.',
  WARN: 'L’avertissement reste dans l’historique, marqué comme levé.',
} as const;

/**
 * La confirmation d'une levée. Elle agit sur une personne et sur Discord : rien ne part avant le clic
 * sur « Lever la sanction », et un refus du serveur (permission, bot trop bas, Discord indisponible)
 * s'affiche ici sans fermer la fenêtre.
 */
export function RevokeDialog({
  guildId,
  sanction,
  onClose,
}: {
  guildId: string;
  sanction: CaseSummary;
  onClose: () => void;
}) {
  const type = sanction.type as keyof typeof REVOKE_LABELS;
  const [reason, setReason] = useState('');
  // Une autre levée est passée avant : on le dit, au lieu de fermer sans rien expliquer
  const [alreadyRevoked, setAlreadyRevoked] = useState(false);
  // Un avertissement retiré n'a ni appel à Discord ni colonne pour la raison : on ne la demande pas
  const withReason = type !== 'WARN';
  const revoke = useRevokeCase(guildId);
  const titleId = useId();
  const reasonId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  // Un garde immédiat : l'état de la mutation ne change qu'au rendu suivant, un double clic passerait
  const sending = useRef(false);

  // Le champ prend le focus à l'ouverture, ou « Annuler » quand il n'y a pas de champ (un avertissement) :
  // Échap n'est entendu que si le focus est dans la fenêtre. Échap annule, sauf pendant l'envoi.
  useEffect(() => (withReason ? field.current : cancelButton.current)?.focus(), [withReason]);
  const cancel = () => {
    if (!revoke.isPending) onClose();
  };

  const confirm = () => {
    if (sending.current) return;
    sending.current = true;
    revoke.mutate(
      { number: sanction.number, reason: withReason ? reason.trim() : undefined },
      {
        onSuccess: (result) => (result.alreadyRevoked ? setAlreadyRevoked(true) : onClose()),
        // Refusée : on peut réessayer
        onError: () => {
          sending.current = false;
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
        className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-white/10 bg-surface p-6"
      >
        <h3 id={titleId} className="font-display text-xl font-semibold text-white">
          {REVOKE_LABELS[type]} #{sanction.number} ?
        </h3>
        <p className="text-stone-300">
          Sanction visant <strong className="text-white">{sanction.target.name}</strong>.{' '}
          {EFFECTS[type]}
        </p>
        {withReason && (
          <div className="flex flex-col gap-2">
            <label htmlFor={reasonId} className="text-sm font-medium text-stone-100">
              Raison (facultative)
            </label>
            <textarea
              id={reasonId}
              ref={field}
              value={reason}
              maxLength={MAX_REASON}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              className={inputClass}
            />
            <div className="flex items-start justify-between gap-3 text-xs text-stone-400">
              <p>Visible dans le journal d’audit de Discord et le salon de logs du serveur.</p>
              <p className="shrink-0 tabular-nums">
                {reason.length} / {MAX_REASON}
              </p>
            </div>
          </div>
        )}
        {revoke.error && (
          <p role="alert" className="text-sm text-flame">
            {revoke.error.message}
          </p>
        )}
        {alreadyRevoked && (
          <p role="status" className="text-sm text-stone-200">
            Cette sanction était déjà levée par quelqu’un d’autre : rien n’a été refait.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          {alreadyRevoked ? (
            <Button type="button" onClick={onClose}>
              Fermer
            </Button>
          ) : (
            <>
              <button
                ref={cancelButton}
                type="button"
                onClick={cancel}
                disabled={revoke.isPending}
                className={buttonClass('ghost')}
              >
                Annuler
              </button>
              <Button type="button" onClick={confirm} disabled={revoke.isPending}>
                Lever la sanction
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
