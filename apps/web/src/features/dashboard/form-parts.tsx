import type { GuildChannelSummary, GuildRoleSummary } from '@phenix/shared';
import type { UseFormRegisterReturn } from 'react-hook-form';

/** Les salons d'un <select>, précédés de l'option vide (« Aucun », « Choisis un salon »…). */
export function ChannelOptions({
  channels,
  empty,
}: {
  channels: GuildChannelSummary[];
  empty: string;
}) {
  return (
    <>
      <option value="">{empty}</option>
      {channels.map((channel) => (
        <option key={channel.id} value={channel.id}>
          #{channel.name}
          {channel.parentName ? ` (${channel.parentName})` : ''}
        </option>
      ))}
    </>
  );
}

/** Le point d'un rôle sans couleur, comme dans Discord. */
const NO_COLOR = '#a8a29e';

/**
 * Les rôles du serveur à cocher, avec leur couleur. Toutes les cases portent le même
 * register('…') : react-hook-form en fait une liste d'IDs.
 */
export function RoleChecklist({
  roles,
  registration,
}: {
  roles: GuildRoleSummary[];
  registration: UseFormRegisterReturn;
}) {
  if (roles.length === 0) {
    return <p className="text-sm text-stone-400">Aucun rôle sur ce serveur pour l'instant.</p>;
  }
  return (
    // Un serveur peut avoir des dizaines de rôles : la liste défile dans son cadre
    <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
      {roles.map((role) => (
        <label
          key={role.id}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/8 px-3 py-2 text-sm transition hover:border-white/20 has-checked:border-flame/50 has-checked:bg-flame/8"
        >
          <input
            type="checkbox"
            value={role.id}
            className="size-4 accent-flame"
            {...registration}
          />
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: role.color ?? NO_COLOR }}
          />
          <span className="truncate text-stone-100">{role.name}</span>
        </label>
      ))}
    </div>
  );
}
