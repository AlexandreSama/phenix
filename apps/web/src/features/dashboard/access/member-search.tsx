import type { GuildDelegate, GuildMemberResult } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { inputClass } from '../../../components/ui/field';
import { memberSearchQuery } from '../api';

/** La valeur, une fois que la frappe s'arrête `delay` ms : une requête par mot, pas par lettre. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

interface Props {
  guildId: string;
  delegates: GuildDelegate[];
  onPick: (member: GuildMemberResult) => void;
  /** Le délai avant de chercher ; 0 dans les tests */
  delay?: number;
}

/** Cherche un membre du serveur par pseudo ou surnom, et le choisit. */
export function MemberSearch({ guildId, delegates, onPick, delay = 300 }: Props) {
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), delay);
  const results = useQuery(memberSearchQuery(guildId, search));
  const tooShort = search.length < 2;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label htmlFor="member-search" className="text-sm font-medium text-stone-100">
          Chercher un membre
        </label>
        <input
          id="member-search"
          type="search"
          autoComplete="off"
          placeholder="Pseudo ou surnom"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby="member-search-hint"
          className={inputClass}
        />
        <p id="member-search-hint" className="text-[13px] text-stone-400">
          Deux lettres au moins : la recherche porte sur le début du pseudo ou du surnom.
        </p>
      </div>

      {!tooShort && results.error && (
        <p role="alert" className="text-[13px] text-flame">
          {results.error.message}
        </p>
      )}
      {!tooShort && results.data?.length === 0 && (
        <p role="status" className="text-sm text-stone-400">
          Aucun membre ne commence par « {search} ».
        </p>
      )}
      {!tooShort && results.data && results.data.length > 0 && (
        <ul aria-label="Membres trouvés" className="flex flex-col gap-1.5">
          {results.data.map((member) => {
            const has = delegates.some((delegate) => delegate.userId === member.id);
            const name = member.displayName ?? member.username;
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2.5"
              >
                <img src={member.avatarUrl} alt="" className="size-9 shrink-0 rounded-full" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-white">{name}</span>
                  <span className="truncate text-[13px] text-stone-400">
                    @{member.username}
                    {has && ' · a déjà un accès'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onPick(member)}
                  aria-label={`${has ? 'Modifier' : 'Choisir'} ${name}`}
                  className="min-h-10 shrink-0 rounded-lg border border-white/12 px-3.5 text-sm font-medium text-stone-200 transition hover:border-flame/50 hover:text-white focus-visible:outline-2 focus-visible:outline-gold"
                >
                  {has ? 'Modifier' : 'Choisir'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
