import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, NO_REASON, type CaseSummary } from '@phenix/shared';
import { Link } from '@tanstack/react-router';
import { Badge, type BadgeTone } from '../../../components/ui/badge';
import { buttonClass } from '../../../components/ui/button';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const format = (iso: string) => dateTime.format(new Date(iso));

const STATUS_TONES: Record<NonNullable<CaseSummary['status']>, BadgeTone> = {
  active: 'flame',
  revoked: 'neutral',
  ended: 'muted',
};

/** Ce qu'on peut lever depuis le site : un avertissement, une sourdine ou un ban encore actifs. */
export function canRevoke(sanction: CaseSummary): boolean {
  return (
    sanction.status === 'active' &&
    (sanction.type === 'WARN' || sanction.type === 'MUTE' || sanction.type === 'BAN')
  );
}

/** Le libellé du bouton, qui dit ce qu'il fait à cette sanction. */
export const REVOKE_LABELS = {
  WARN: 'Retirer l’avertissement',
  MUTE: 'Lever la sourdine',
  BAN: 'Lever le bannissement',
} as const;

/** Une sanction de la liste : de quoi la retrouver, savoir sur qui elle porte et où elle en est. */
export function CaseRow({
  guildId,
  sanction,
  onRevoke,
}: {
  guildId: string;
  sanction: CaseSummary;
  /** Sans lui, pas de bouton de levée */
  onRevoke?: (sanction: CaseSummary) => void;
}) {
  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-8 min-w-12 items-center justify-center rounded-lg bg-white/5 px-2 font-mono text-sm text-stone-300 tabular-nums">
          #{sanction.number}
        </span>
        <Badge>{CASE_TYPE_LABELS[sanction.type]}</Badge>
        {sanction.status && (
          <Badge tone={STATUS_TONES[sanction.status]}>{CASE_STATUS_LABELS[sanction.status]}</Badge>
        )}
        <Link
          to="/dashboard/$guildId/moderation/membres/$userId"
          params={{ guildId, userId: sanction.target.id }}
          className="min-w-0 truncate font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-gold"
        >
          {sanction.target.name}
        </Link>
        <span className="text-sm text-stone-400">
          par{' '}
          <Link
            to="/dashboard/$guildId/moderation"
            params={{ guildId }}
            search={{ moderatorId: sanction.moderator.id }}
            className="text-stone-200 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-gold"
          >
            {sanction.moderator.name}
          </Link>
        </span>
      </div>
      {sanction.reason ? (
        <p className="text-pretty break-words text-stone-200">{sanction.reason}</p>
      ) : (
        <p className="text-stone-500 italic">{NO_REASON}</p>
      )}
      <p className="flex flex-wrap gap-x-3 text-sm text-stone-400">
        <span>Le {format(sanction.createdAt)}</span>
        {sanction.expiresAt && <span>jusqu’au {format(sanction.expiresAt)}</span>}
        {sanction.revokedAt && (
          <span>
            Levée le {format(sanction.revokedAt)}
            {sanction.revokedBy && ` par ${sanction.revokedBy.name}`}
          </span>
        )}
      </p>
      {onRevoke && canRevoke(sanction) && (
        <button
          type="button"
          onClick={() => onRevoke(sanction)}
          className={`${buttonClass('ghost')} self-start`}
        >
          {REVOKE_LABELS[sanction.type as keyof typeof REVOKE_LABELS]}
        </button>
      )}
    </li>
  );
}
