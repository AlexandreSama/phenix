import type { GiveawaySummary, GuildChannelSummary } from '@phenix/shared';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import type { GiveawayAction } from '../api';
import { PublicationBadge } from '../publication-badge';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const format = (iso: string) => dateTime.format(new Date(iso));
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

export interface GiveawayState {
  /** Où en est le giveaway, en une ligne */
  line: string;
  /** Les actions possibles maintenant (la suppression l'est toujours) */
  actions: { action: Exclude<GiveawayAction, 'delete'>; label: string; confirm?: string }[];
}

/** Ce que la carte affiche et propose, selon l'étape du giveaway. */
export function giveawayState(giveaway: GiveawaySummary, now = Date.now()): GiveawayState {
  const entries = plural(giveaway.entryCount, 'participant');
  if (!giveaway.endedAt) {
    if (Date.parse(giveaway.endsAt) <= now) {
      return { line: `Tirage en cours… · ${entries}`, actions: [] };
    }
    return {
      line: `Fin le ${format(giveaway.endsAt)} · ${entries} · ${plural(giveaway.winnersCount, 'gagnant')}`,
      actions: [{ action: 'end', label: 'Terminer', confirm: 'Tirer au sort maintenant' }],
    };
  }

  const names = giveaway.winners.map((winner) => winner.name).join(', ');
  const result = names
    ? `Gagnant${giveaway.winners.length > 1 ? 's' : ''} : ${names}`
    : 'Aucun gagnant';
  const line = `Terminé le ${format(giveaway.endedAt)} · ${entries} · ${result}`;
  if (giveaway.announced) {
    return {
      line,
      actions: [{ action: 'reroll', label: 'Relancer', confirm: 'Tirer de nouveaux gagnants' }],
    };
  }
  // L'annonce a échoué (salon supprimé, droits retirés) : on peut réessayer, sans nouveau tirage
  if (giveaway.publishError) {
    return { line, actions: [{ action: 'end', label: 'Réessayer l’annonce' }] };
  }
  return { line: `${line} · annonce en cours…`, actions: [] };
}

interface Props {
  giveaway: GiveawaySummary;
  channel: GuildChannelSummary | undefined;
  onAction: (action: GiveawayAction) => Promise<unknown>;
}

export function GiveawayCard({ giveaway, channel, onAction }: Props) {
  // Les actions qui comptent demandent un second clic, sans fenêtre qui bloque la page
  const [confirming, setConfirming] = useState<{ action: GiveawayAction; label: string } | null>(
    null,
  );
  const { line, actions } = giveawayState(giveaway);

  const run = (action: GiveawayAction) => {
    setConfirming(null);
    void onAction(action);
  };

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-flame tabular-nums">#{giveaway.id}</span>
          <h2 className="truncate font-semibold text-white">{giveaway.prize}</h2>
          {!giveaway.endedAt && <PublicationBadge status={giveaway.publication} />}
        </div>
        <p className="text-sm text-stone-400">
          #{channel?.name ?? 'salon supprimé'} · {line}
        </p>
        {giveaway.publishError && (
          <p role="alert" className="mt-1 text-sm text-flame">
            {giveaway.publishError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Annuler
            </Button>
            <Button onClick={() => run(confirming.action)}>{confirming.label}</Button>
          </>
        ) : (
          <>
            {actions.map(({ action, label, confirm }) => (
              <Button
                key={action}
                variant="ghost"
                onClick={() => (confirm ? setConfirming({ action, label: confirm }) : run(action))}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => setConfirming({ action: 'delete', label: 'Confirmer la suppression' })}
            >
              Supprimer
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
