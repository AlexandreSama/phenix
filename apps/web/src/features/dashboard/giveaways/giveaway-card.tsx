import type { GiveawaySummary, GuildChannelSummary } from '@phenix/shared';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
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

/** L'étape en un mot, pour le badge à côté du lot. */
function StepBadge({ giveaway }: { giveaway: GiveawaySummary }) {
  if (giveaway.endedAt) return <Badge tone="muted">Terminé</Badge>;
  if (Date.parse(giveaway.endsAt) <= Date.now()) {
    return (
      <Badge tone="neutral" pulse>
        Tirage…
      </Badge>
    );
  }
  return <Badge tone="gold">En cours</Badge>;
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
  const active = !giveaway.endedAt;

  const run = (action: GiveawayAction) => {
    setConfirming(null);
    void onAction(action);
  };

  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 transition sm:flex-row sm:items-center ${
        confirming ? 'border-flame/50' : 'border-white/8'
      }`}
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl max-sm:hidden ${
          active ? 'bg-flame/12 text-flame' : 'bg-white/6 text-stone-400'
        }`}
      >
        <Icon name={active ? 'gift' : 'trophy'} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold text-white">{giveaway.prize}</h3>
          <span className="font-mono text-xs text-stone-500 tabular-nums">#{giveaway.id}</span>
          <StepBadge giveaway={giveaway} />
          {active && giveaway.publication !== 'published' && (
            <PublicationBadge status={giveaway.publication} />
          )}
        </div>
        <p className="text-sm text-stone-400">
          <span className="text-stone-300">#{channel?.name ?? 'salon supprimé'}</span> · {line}
        </p>
        {giveaway.publishError && (
          <p role="alert" className="text-sm text-flame">
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
    </article>
  );
}
