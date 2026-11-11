import {
  TD2_PLATFORM_LABELS,
  TD2_REPORT_REASONS,
  TD2_REPORT_STATUS_LABELS,
  type Td2ReportAdminSummary,
} from '@phenix/shared';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { evidenceUrl } from '../api';

const STATUS_CLASSES: Record<Td2ReportAdminSummary['status'], string> = {
  PENDING: 'border-yellow text-yellow',
  IN_REVIEW: 'border-gold text-gold',
  CONFIRMED: 'border-flame text-flame',
  REJECTED: 'border-stone-500 text-stone-400',
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
    <li className="flex flex-col gap-3 py-4" aria-label={`Signalement #${report.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-white">
          {report.playerName}{' '}
          <span className="font-normal text-stone-400">
            · {TD2_PLATFORM_LABELS[report.platform]}
          </span>
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASSES[report.status]}`}
        >
          {TD2_REPORT_STATUS_LABELS[report.status]}
        </span>
      </div>
      <p className="text-sm text-stone-300">
        {TD2_REPORT_REASONS[report.reason] ?? report.reason} · {report.guildName} ·{' '}
        {dateTime.format(new Date(report.createdAt))} · #{report.id}
      </p>
      {report.details && (
        <p className="text-sm whitespace-pre-line text-stone-400">{report.details}</p>
      )}

      {report.evidenceCount > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: report.evidenceCount }, (_, index) => (
            <a
              key={index}
              href={evidenceUrl(report.id, index)}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-brown hover:border-gold"
            >
              <img
                src={evidenceUrl(report.id, index)}
                alt={`Capture ${index + 1} du signalement #${report.id}`}
                loading="lazy"
                className="h-24 w-36 object-cover"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-stone-500">Aucune capture.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!confirming ? (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
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
      {error && (
        <p role="alert" className="text-xs text-flame">
          {error}
        </p>
      )}
    </li>
  );
}
