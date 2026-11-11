import type {
  MetricsOverview,
  MetricsRange,
  ServiceHeartbeat,
  ServiceStatus,
} from '@phenix/shared';
import { METRICS_RANGES } from '@phenix/shared';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../../components/icon';
import { Badge } from '../../../components/ui/badge';
import { Panel } from '../../../components/ui/panel';
import { formatBytes, formatCount, formatMs, formatPercent, formatUptime } from './format';

const SERVICE_NAMES = { bot: 'Bot', api: 'API' } as const;

function OnlineBadge({ status }: { status: ServiceStatus }) {
  return status.online ? (
    <Badge tone="gold" pulse>
      En ligne
    </Badge>
  ) : (
    <Badge tone="flame">Hors ligne</Badge>
  );
}

function Tile({
  icon,
  label,
  value,
  detail,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-white/8 bg-surface p-4">
      <dt className="flex items-center gap-2 text-sm text-stone-400">
        <Icon name={icon} className="size-4 shrink-0 text-flame" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-2xl font-semibold text-white tabular-nums">{value}</span>
        <span className="text-xs text-stone-400">{detail}</span>
      </dd>
    </div>
  );
}

/** La rangée de chiffres clés, en haut de la page. */
export function KeyFigures({
  overview,
  range,
}: {
  overview: MetricsOverview;
  range: MetricsRange;
}) {
  const totals = overview.commands[range];
  const { bot, api } = overview.services;
  const label = METRICS_RANGES[range].label;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon="server"
        label="Bot"
        value={<OnlineBadge status={bot} />}
        detail={bot.online ? `Depuis ${formatUptime(bot.heartbeat.uptime)}` : 'Aucun battement'}
      />
      <Tile
        icon="pulse"
        label="API"
        value={<OnlineBadge status={api} />}
        detail={api.online ? `Depuis ${formatUptime(api.heartbeat.uptime)}` : 'Aucun battement'}
      />
      <Tile
        icon="hash"
        label={`Commandes · ${label}`}
        value={formatCount(totals.count)}
        detail={`${formatCount(totals.errors)} en erreur`}
      />
      <Tile
        icon="users"
        label={`Serveurs actifs · ${label}`}
        value={formatCount(totals.guilds)}
        detail={
          bot.online && bot.heartbeat.guilds !== undefined
            ? `sur ${formatCount(bot.heartbeat.guilds)}`
            : 'au moins une commande'
        }
      />
    </dl>
  );
}

function memoryText(beat: ServiceHeartbeat): string {
  const used = formatBytes(beat.memory);
  return beat.memoryLimit === null
    ? `${used} (sans limite)`
    : `${used} sur ${formatBytes(beat.memoryLimit)}`;
}

function ServiceCard({ service, status }: { service: 'bot' | 'api'; status: ServiceStatus }) {
  const name = SERVICE_NAMES[service];
  return (
    <section
      aria-label={name}
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-white/8 bg-surface-raised p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-display font-semibold text-white">{name}</h4>
        <OnlineBadge status={status} />
      </div>
      {status.online ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {[
            ['CPU', formatPercent(status.heartbeat.cpu)],
            ['Mémoire', memoryText(status.heartbeat)],
            ['En ligne depuis', formatUptime(status.heartbeat.uptime)],
            ['Version', status.heartbeat.version],
            ['Retard de boucle', formatMs(status.heartbeat.eventLoopDelayMs)],
            ...(status.heartbeat.guilds === undefined
              ? []
              : [['Serveurs', formatCount(status.heartbeat.guilds)]]),
            ...(status.heartbeat.ping === undefined
              ? []
              : [
                  [
                    'Ping Discord',
                    status.heartbeat.ping < 0
                      ? 'pas encore mesuré'
                      : formatMs(status.heartbeat.ping),
                  ],
                ]),
          ].map(([term, value]) => (
            <div key={term} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-stone-400">{term}</dt>
              <dd className="font-medium break-words text-white tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-stone-400">
          Pas de battement depuis 90 secondes : le service est arrêté, ou ne joint plus Valkey.
        </p>
      )}
    </section>
  );
}

/** L'état en direct des deux services, redemandé toutes les 30 secondes. */
export function LivePanel({ overview }: { overview: MetricsOverview }) {
  return (
    <Panel
      title="État en direct"
      icon="pulse"
      description="Le dernier battement de chaque service, toutes les 30 secondes. Le CPU est rapporté aux CPU permis au conteneur."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ServiceCard service="bot" status={overview.services.bot} />
        <ServiceCard service="api" status={overview.services.api} />
      </div>
    </Panel>
  );
}
