import {
  MAX_XP_EXCLUDED_CHANNELS,
  type GuildCategorySummary,
  type GuildChannelSummary,
} from '@phenix/shared';
import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface Props {
  registration: UseFormRegisterReturn;
  /** Les identifiants cochés en ce moment */
  selected: string[];
  channels: GuildChannelSummary[];
  voiceChannels: GuildChannelSummary[];
  forumChannels: GuildChannelSummary[];
  categories: GuildCategorySummary[];
  /** Identifiants enregistrés que Discord ne connaît plus */
  deletedIds: string[];
  error?: string;
}

interface Entry {
  id: string;
  name: string;
  detail?: string | null;
}

const toEntries = (list: GuildChannelSummary[]): Entry[] =>
  list.map(({ id, name, parentName }) => ({ id, name, detail: parentName }));

/**
 * Les salons exclus du gain d'XP : des cases à cocher en quatre groupes (textuels, vocaux,
 * forums et médias, catégories), comme les rôles (RoleChecklist). Toutes les cases portent le même register.
 */
export function ExcludedChannelsField({
  registration,
  selected,
  channels,
  voiceChannels,
  forumChannels,
  categories,
  deletedIds,
  error,
}: Props) {
  const limitReached = selected.length >= MAX_XP_EXCLUDED_CHANNELS;

  const renderBox = (entry: Entry, marker: string) => (
    <label
      key={entry.id}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/8 px-3 py-2 text-sm transition hover:border-white/20 has-checked:border-flame/50 has-checked:bg-flame/8 has-disabled:cursor-not-allowed has-disabled:opacity-50"
    >
      <input
        type="checkbox"
        value={entry.id}
        className="size-4 accent-flame"
        disabled={limitReached && !selected.includes(entry.id)}
        {...registration}
      />
      <span aria-hidden="true" className="w-5 shrink-0 text-center text-stone-400">
        {marker}
      </span>
      <span className="truncate text-stone-100">{entry.name}</span>
      {entry.detail && <span className="truncate text-xs text-stone-400">({entry.detail})</span>}
    </label>
  );

  const group = (title: string, entries: Entry[], marker: string): ReactNode =>
    entries.length > 0 && (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium tracking-wide text-stone-400 uppercase">
          {title}
        </legend>
        {/* Un serveur peut avoir des dizaines de salons : la liste défile dans son cadre */}
        <div className="grid max-h-60 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {entries.map((entry) => renderBox(entry, marker))}
        </div>
      </fieldset>
    );

  return (
    <fieldset className="flex flex-col gap-4" aria-describedby="xpExcludedChannelIds-hint">
      <legend className="mb-2 text-sm font-medium text-stone-100">Salons exclus de l'XP</legend>
      <p id="xpExcludedChannelIds-hint" className="text-[13px] leading-relaxed text-stone-400">
        Personne ne gagne d'XP dans ces salons. Une catégorie exclue couvre tous ses salons ; un
        forum ou un salon média couvre les messages de ses posts ; les fils de discussion héritent
        de l'exclusion de leur salon.
      </p>
      {group('Salons textuels', toEntries(channels), '#')}
      {group('Salons vocaux', toEntries(voiceChannels), '🔊')}
      {group('Forums et médias', toEntries(forumChannels), '💬')}
      {group(
        'Catégories',
        categories.map(({ id, name }) => ({ id, name })),
        '📁',
      )}
      {group(
        'Salons supprimés',
        deletedIds.map((id) => ({ id, name: 'Salon supprimé', detail: id })),
        '⚠',
      )}
      {/* Toujours dans le DOM : les lecteurs d'écran n'annoncent que le changement d'une zone déjà présente */}
      <p role="status" className="text-[13px] text-gold">
        {limitReached &&
          `${MAX_XP_EXCLUDED_CHANNELS} salons au plus : retire-en un pour en choisir un autre.`}
      </p>
      {error && (
        <p role="alert" className="text-[13px] text-flame">
          {error}
        </p>
      )}
    </fieldset>
  );
}
