import type { ReactNode } from 'react';
import { Icon } from '../icon';
import { Button } from './button';

interface FormActionsProps {
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
  /** Faux : le bouton reste grisé (rien n'a changé, par exemple) */
  canSubmit?: boolean;
  /** Des modifications attendent : la barre le dit, et propose de les annuler */
  dirty?: boolean;
  onReset?: () => void;
  /** Ce qu'il faut lire après un enregistrement réussi */
  success?: string | false;
  /** Le refus de l'API */
  error?: string;
  /** Le texte au repos, quand rien ne se passe */
  idle?: string;
  /** Un bouton de plus, avant celui d'envoi (« Annuler » qui ramène à la liste…) */
  secondary?: ReactNode;
}

/**
 * La barre d'envoi d'un formulaire, collée en bas de l'écran pendant qu'on fait défiler :
 * le bouton reste à portée, et l'état (modifié, enregistré, refusé) toujours visible.
 */
export function FormActions({
  submitLabel,
  submittingLabel,
  isSubmitting,
  canSubmit = true,
  dirty = false,
  onReset,
  success,
  error,
  idle,
  secondary,
}: FormActionsProps) {
  // Au repos, sur téléphone, le bouton seul : la phrase prendrait trois lignes
  let state: ReactNode = idle ? <p className="text-stone-400 max-sm:hidden">{idle}</p> : null;
  if (error) {
    state = (
      <p role="alert" className="text-flame">
        {error}
      </p>
    );
  } else if (dirty) {
    state = (
      <p className="flex items-center gap-2 text-stone-200">
        <span aria-hidden="true" className="size-2 rounded-full bg-gold" />
        Modifications non enregistrées
      </p>
    );
  } else if (success) {
    state = (
      <p role="status" className="flex items-center gap-2 text-gold">
        <Icon name="check" className="size-4" />
        {success}
      </p>
    );
  }

  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-white/10 bg-surface-raised/95 py-3 pr-3 pl-5 shadow-[0_16px_48px_rgb(0_0_0/0.45)] backdrop-blur">
      <div className="min-w-0 flex-1 text-sm">{state}</div>
      <div className="flex flex-wrap gap-2">
        {dirty && onReset && (
          <Button type="button" variant="ghost" onClick={onReset} disabled={isSubmitting}>
            Annuler les modifications
          </Button>
        )}
        {secondary}
        <Button type="submit" disabled={isSubmitting || !canSubmit}>
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}
