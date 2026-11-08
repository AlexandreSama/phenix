import type { ManageableGuild } from '@phenix/shared';
import { Link } from '@tanstack/react-router';
import { buttonClass } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { GuildIcon } from '../../../components/guild-icon';

export function GuildCard({ guild }: { guild: ManageableGuild }) {
  return (
    <Card className="flex items-center gap-4">
      <GuildIcon name={guild.name} iconUrl={guild.iconUrl} />
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
