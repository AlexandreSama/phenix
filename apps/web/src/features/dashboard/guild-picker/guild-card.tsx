import type { ManageableGuild } from '@phenix/shared';
import { Link } from '@tanstack/react-router';
import { buttonClass } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

/** Initiales d'un serveur sans icône, comme dans Discord : « Les Agents » → « LA ». */
export function guildInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export function GuildCard({ guild }: { guild: ManageableGuild }) {
  return (
    <Card className="flex items-center gap-4">
      {guild.iconUrl ? (
        <img src={guild.iconUrl} alt="" className="size-12 rounded-full" />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-full bg-brown font-bold">
          {guildInitials(guild.name)}
        </span>
      )}
      <span className="flex-1 truncate font-semibold">{guild.name}</span>
      {guild.botPresent ? (
        <Link
          to="/dashboard/$guildId"
          params={{ guildId: guild.id }}
          className={buttonClass('primary')}
        >
          Configurer
        </Link>
      ) : (
        <a href={`/api/invite?guildId=${guild.id}`} className={buttonClass('ghost')}>
          Inviter le bot
        </a>
      )}
    </Card>
  );
}
