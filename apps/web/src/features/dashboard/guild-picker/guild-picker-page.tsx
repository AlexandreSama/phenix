import { useQuery } from '@tanstack/react-query';
import { guildsQuery } from '../api';
import { GuildCard } from './guild-card';

export function GuildPickerPage() {
  const { data: guilds, isPending, error } = useQuery(guildsQuery);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tes serveurs</h1>
        <p className="text-sm text-stone-400">Ceux où tu as la permission « Gérer le serveur ».</p>
      </div>
      {isPending && <p>Chargement…</p>}
      {error && <p role="alert">{error.message}</p>}
      {guilds?.length === 0 && <p>Aucun serveur à gérer pour l'instant.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {guilds?.map((guild) => (
          <GuildCard key={guild.id} guild={guild} />
        ))}
      </div>
    </section>
  );
}
