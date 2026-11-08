/** Initiales d'un serveur sans icône, comme dans Discord : « Les Agents » → « LA ». */
export function guildInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

interface GuildIconProps {
  name: string;
  iconUrl: string | null;
  className?: string;
}

/** L'icône d'un serveur, ou ses initiales s'il n'en a pas. */
export function GuildIcon({ name, iconUrl, className = 'size-12' }: GuildIconProps) {
  return iconUrl ? (
    <img src={iconUrl} alt="" className={`${className} shrink-0 rounded-full`} />
  ) : (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-brown font-bold`}
    >
      {guildInitials(name)}
    </span>
  );
}
