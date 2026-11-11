import {
  TD2_PLATFORM_LABELS,
  TD2_REPORT_REASONS,
  TD2_REPORT_STATUS_LABELS,
  type Td2ReportAdminSummary,
} from '@phenix/shared';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Badge, type BadgeTone } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { evidenceUrl } from '../api';

/** La couleur d'un statut : du neutre (pas encore vu) à l'orange (confirmé) */
export const STATUS_TONES: Record<Td2ReportAdminSummary['status'], BadgeTone> = {
  PENDING: 'neutral',
  IN_REVIEW: 'gold',
  CONFIRMED: 'flame',
  REJECTED: 'muted',
};

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

interface Props {
  report: Td2ReportAdminSummary;
  onDelete: (id: number) => Promise<unknown>;
}

/** Un signalement du réseau : qui, où, pourquoi, ses captures, et sa suppression en deux clics. */
export function ReportItem({ report, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible');
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <li
      aria-label={`Signalement #${report.id}`}
      className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 transition sm:p-6 ${
        confirming ? 'border-flame/50' : 'border-white/8'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-lg font-semibold text-white">
              {report.playerName}
            </span>
            <span className="text-sm text-stone-400">{TD2_PLATFORM_LABELS[report.platform]}</span>
          </p>
          <p className="text-sm text-stone-300">
            {TD2_REPORT_REASONS[report.reason] ?? report.reason} · {report.guildName}
          </p>
        </div>
        <Badge tone={STATUS_TONES[report.status]}>{TD2_REPORT_STATUS_LABELS[report.status]}</Badge>
      </div>

      {report.details && (
        <p className="rounded-xl bg-white/4 px-4 py-3 text-sm whitespace-pre-line text-stone-300">
          {report.details}
        </p>
      )}

      {report.evidenceCount > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: report.evidenceCount }, (_, index) => (
            <a
              key={index}
              href={evidenceUrl(report.id, index)}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-white/10 transition hover:border-gold focus-visible:outline-2 focus-visible:outline-gold"
            >
              <img
                src={evidenceUrl(report.id, index)}
                alt={`Capture ${index + 1} du signalement #${report.id}`}
                loading="lazy"
                className="h-24 w-36 bg-ink object-cover"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-stone-500">Aucune capture.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4">
        <p className="flex items-center gap-2 text-[13px] text-stone-400">
          <Icon name="clock" className="size-3.5" />
          {dateTime.format(new Date(report.createdAt))} · #{report.id}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!confirming ? (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Icon name="trash" className="size-4" />
              Supprimer
            </Button>
          ) : (
            <>
              <p className="text-sm text-stone-300">
                Supprimer le signalement et ses captures, partout ?
              </p>
              <Button onClick={remove} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Oui, supprimer'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                Annuler
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-flame">
          {error}
        </p>
      )}
    </li>
  );
}
