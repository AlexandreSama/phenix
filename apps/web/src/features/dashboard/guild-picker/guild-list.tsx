import type { ManageableGuild } from '@phenix/shared';
import { useId } from 'react';
import { GuildCard } from './guild-card';

/** À partir de combien de serveurs la recherche apparaît : en dessous, la liste se lit d'un coup d'œil. */
export const SEARCH_THRESHOLD = 7;

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr');

/** Les serveurs dont le nom contient la recherche, sans tenir compte des accents ni des majuscules. */
export function filterGuilds(guilds: ManageableGuild[], search: string): ManageableGuild[] {
  const wanted = normalize(search.trim());
  return wanted ? guilds.filter((guild) => normalize(guild.name).includes(wanted)) : guilds;
}

interface GroupProps {
  title: string;
  hint?: string;
  guilds: ManageableGuild[];
}

function GuildGroup({ title, hint, guilds }: GroupProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2
          id={titleId}
          className="flex items-center gap-2.5 font-display text-lg font-semibold text-white"
        >
          {title}{' '}
          <span className="rounded-full bg-white/8 px-2 py-0.5 font-sans text-xs font-medium text-stone-300">
            {/* Le chiffre se voit, la phrase entière se lit : « 2 serveurs » */}
            <span aria-hidden="true">{guilds.length}</span>
            <span className="sr-only">
              {guilds.length} {guilds.length > 1 ? 'serveurs' : 'serveur'}
            </span>
          </span>
        </h2>
        {hint && <p className="text-sm text-stone-400">{hint}</p>}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {guilds.map((guild) => (
          <li key={guild.id}>
            <GuildCard guild={guild} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Les serveurs en deux groupes : ceux où le bot est déjà, puis ceux où l'inviter. */
export function GuildList({ guilds, search = '' }: { guilds: ManageableGuild[]; search?: string }) {
  const visible = filterGuilds(guilds, search);
  const withBot = visible.filter((guild) => guild.botPresent);
  const withoutBot = visible.filter((guild) => !guild.botPresent);

  return (
    <div className="flex flex-col gap-10">
      {visible.length === 0 && (
        <p
          role="status"
          className="rounded-2xl border border-white/8 px-5 py-8 text-center text-stone-300"
        >
          Aucun serveur ne correspond à «&nbsp;{search.trim()}&nbsp;».
        </p>
      )}
      {withBot.length > 0 && <GuildGroup title="Avec PhenixMG" guilds={withBot} />}
      {withoutBot.length > 0 && (
        <GuildGroup
          title="Sans PhenixMG"
          hint="L'invitation s'ouvre dans un nouvel onglet. En revenant ici, le serveur passe dans le groupe du dessus."
          guilds={withoutBot}
        />
      )}
    </div>
  );
}
