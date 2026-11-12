import { CASE_TYPE_LABELS, type MemberModeration } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/panel';
import { casesQuery, memberModerationQuery } from '../api';
import { firstFailure, LoadError, PageSkeleton } from '../query-state';
import { CaseList } from './case-list';
import { Pager } from './pager';

const ROUTE = '/dashboard/$guildId/moderation/membres/$userId';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Ce qui est encore en cours pour ce membre, en trois phrases. */
function activeLines(member: MemberModeration): string[] {
  return [
    member.activeWarns > 0
      ? `${plural(member.activeWarns, 'avertissement actif', 'avertissements actifs')}`
      : 'Aucun avertissement actif',
    member.activeMute
      ? `Sourdine active${member.activeMute.expiresAt ? ` jusqu’au ${dateTime.format(new Date(member.activeMute.expiresAt))}` : ''}`
      : 'Aucune sourdine active',
    member.activeBan
      ? `Bannissement actif (#${member.activeBan.number})`
      : 'Aucun bannissement actif',
  ];
}

/** « Avertissement : 2 · Bannissement : 1 » : seulement les types que le membre a reçus. */
function typeCounts(member: MemberModeration): string {
  return Object.entries(member.byType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${CASE_TYPE_LABELS[type as keyof typeof CASE_TYPE_LABELS]} : ${count}`)
    .join(' · ');
}

export function MemberPage() {
  const { guildId, userId } = useParams({ from: ROUTE });
  const { page = 1 } = useSearch({ from: ROUTE });
  const member = useQuery(memberModerationQuery(guildId, userId));
  const cases = useQuery(casesQuery(guildId, { targetId: userId }, page));
  const failure = firstFailure([member, cases]);
  const data = cases.data;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/dashboard/$guildId/moderation"
        params={{ guildId }}
        search={{}}
        className={`${buttonClass('ghost')} self-start`}
      >
        <Icon name="arrowLeft" className="size-4" />
        Toutes les sanctions
      </Link>

      {failure.error && <LoadError error={failure.error} onRetry={failure.retry} />}
      {!failure.error && !member.data && (
        <PageSkeleton label="Chargement de la fiche…" panels={1} />
      )}

      {member.data && (
        <>
          <div className="flex items-center gap-4">
            {member.data.user.avatarUrl ? (
              <img
                src={member.data.user.avatarUrl}
                alt=""
                className="size-14 rounded-full bg-white/8"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-14 items-center justify-center rounded-full bg-white/8 text-stone-400"
              >
                <Icon name="user" className="size-6" />
              </span>
            )}
            <div className="min-w-0">
              <PageHeader title={member.data.user.name} />
              <p className="font-mono text-sm text-stone-400">{member.data.user.id}</p>
            </div>
          </div>

          <section
            aria-label="Où en est ce membre"
            className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-surface p-5"
          >
            <p className="font-semibold text-white">
              {plural(member.data.total, 'sanction', 'sanctions')}
            </p>
            {member.data.total > 0 && (
              <p className="text-sm text-stone-400">{typeCounts(member.data)}</p>
            )}
            <ul className="flex flex-col gap-1 text-stone-300">
              {activeLines(member.data).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      {data && (
        <CaseList
          guildId={guildId}
          data={data}
          stale={cases.isPlaceholderData}
          empty={
            data.total > 0 ? (
              <EmptyState icon="shield" title="Cette page n’existe plus">
                <Link
                  to={ROUTE}
                  params={{ guildId, userId }}
                  search={{ page: Math.ceil(data.total / data.pageSize) }}
                  className={buttonClass('ghost')}
                >
                  Aller à la dernière page
                </Link>
              </EmptyState>
            ) : (
              <EmptyState icon="shield" title="Aucune sanction pour ce membre">
                Son historique est vide sur ce serveur.
              </EmptyState>
            )
          }
        />
      )}
      {data && (
        <Pager
          label="Pages de l’historique"
          page={data.page}
          pageCount={Math.ceil(data.total / data.pageSize)}
          link={({ page: target, className, disabled, children }) => (
            <Link
              to={ROUTE}
              params={{ guildId, userId }}
              search={{ page: target > 1 ? target : undefined }}
              disabled={disabled}
              className={className}
            >
              {children}
            </Link>
          )}
        />
      )}
    </div>
  );
}
