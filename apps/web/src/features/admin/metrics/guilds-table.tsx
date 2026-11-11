import type { GuildMetrics, MetricsRange } from '@phenix/shared';
import { METRICS_RANGES } from '@phenix/shared';
import { GuildIcon } from '../../../components/guild-icon';
import { EmptyState } from '../../../components/ui/empty-state';
import { Panel } from '../../../components/ui/panel';
import { formatCount, formatDateTime } from './format';

/** Le nom d'une ligne du classement : un serveur, ou les messages privés. */
const guildName = (guild: GuildMetrics['guilds'][number]) =>
  guild.id === '' ? 'Messages privés' : (guild.name ?? 'Serveur quitté');

/**
 * Les serveurs qui lancent le plus de commandes. Sur téléphone, la commande favorite et la
 * dernière activité passent sous le nom : le tableau ne déborde jamais.
 */
export function GuildsTable({ data, range }: { data: GuildMetrics; range: MetricsRange }) {
  return (
    <Panel
      title="Serveurs les plus actifs"
      icon="users"
      description={`Classés par commandes lancées sur ${METRICS_RANGES[range].label}.`}
      flush
    >
      {data.guilds.length === 0 ? (
        <div className="p-5 sm:p-6">
          <EmptyState icon="users" title="Aucune activité">
            Aucun serveur n’a lancé de commande sur cette période.
          </EmptyState>
        </div>
      ) : (
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Serveurs les plus actifs</caption>
          <thead className="text-xs text-stone-400">
            <tr className="border-b border-white/6">
              <th scope="col" className="w-10 py-3 pl-5 font-medium sm:pl-6">
                <span className="sr-only">Rang</span>#
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Serveur
              </th>
              <th scope="col" className="w-24 px-3 py-3 text-right font-medium sm:w-28">
                Commandes
              </th>
              <th scope="col" className="hidden w-40 px-3 py-3 font-medium md:table-cell">
                Commande favorite
              </th>
              <th scope="col" className="hidden w-36 py-3 pr-6 pl-3 font-medium sm:table-cell">
                Dernière activité
              </th>
            </tr>
          </thead>
          <tbody>
            {data.guilds.map((guild, index) => (
              <tr key={guild.id || 'dm'} className="border-b border-white/6 last:border-0">
                <td className="py-3 pl-5 text-stone-500 tabular-nums sm:pl-6">{index + 1}</td>
                <th scope="row" className="px-3 py-3 font-normal">
                  <span className="flex min-w-0 items-center gap-3">
                    <GuildIcon
                      name={guildName(guild)}
                      iconUrl={guild.iconUrl}
                      className="size-8 text-xs"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-white">{guildName(guild)}</span>
                      <span className="truncate text-xs text-stone-400 md:hidden">
                        /{guild.topCommand}
                        <span className="sm:hidden"> · {formatDateTime(guild.lastActiveAt)}</span>
                      </span>
                    </span>
                  </span>
                </th>
                <td className="px-3 py-3 text-right font-medium text-white tabular-nums">
                  {formatCount(guild.count)}
                </td>
                <td className="hidden truncate px-3 py-3 text-stone-300 md:table-cell">
                  /{guild.topCommand}
                </td>
                <td className="hidden py-3 pr-6 pl-3 text-stone-400 sm:table-cell">
                  {formatDateTime(guild.lastActiveAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
