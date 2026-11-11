import type { ManageableGuild } from '@phenix/shared';
import { Link } from '@tanstack/react-router';
import { GuildIcon } from '../../../components/guild-icon';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';

/**
 * Un serveur de la liste. Bot présent : toute la carte mène à ses réglages.
 * Bot absent : la carte reste en retrait, seul le bouton d'invitation agit.
 */
export function GuildCard({ guild }: { guild: ManageableGuild }) {
  if (guild.botPresent) {
    return (
      <Link
        to="/dashboard/$guildId"
        params={{ guildId: guild.id }}
        aria-label={`Configurer ${guild.name}`}
        className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-surface p-4 transition hover:border-flame/40 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <GuildIcon name={guild.name} iconUrl={guild.iconUrl} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-semibold text-white">{guild.name}</span>
          <span className="flex items-center gap-1.5 text-sm text-stone-400">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
            Bot présent
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-flame">
          {/* Sur téléphone, la flèche suffit : le nom du serveur garde la place */}
          <span className="max-sm:hidden">Configurer</span>
          <Icon
            name="arrowRight"
            className="size-4 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-dashed border-white/12 p-4">
      <GuildIcon
        name={guild.name}
        iconUrl={guild.iconUrl}
        className="size-12 opacity-60 grayscale"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold text-stone-200">{guild.name}</span>
        <span className="text-sm text-stone-400">Bot absent</span>
      </span>
      {/* Un nouvel onglet : en revenant ici, la liste se met à jour (guild-picker-page.tsx) */}
      <a
        href={`/api/invite?guildId=${guild.id}`}
        target="_blank"
        rel="noopener"
        aria-label={`Inviter le bot sur ${guild.name} (nouvel onglet)`}
        className={buttonClass('ghost', 'min-h-11 shrink-0')}
      >
        <Icon name="plus" className="size-4" />
        Inviter
      </a>
    </div>
  );
}
