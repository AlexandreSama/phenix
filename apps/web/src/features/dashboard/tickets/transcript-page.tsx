import { Link, useParams } from '@tanstack/react-router';
import { buttonClass } from '../../../components/ui/button';
import { transcriptUrl } from '../api';

/**
 * Le transcript s'affiche dans une iframe « sandbox » : même si un message contenait du HTML
 * qui avait échappé au bot, il ne pourrait ni lancer de script ni lire le cookie du site.
 */
export function TranscriptPage() {
  const { guildId, ticketId } = useParams({ from: '/dashboard/$guildId/tickets/$ticketId' });
  const url = transcriptUrl(guildId, Number(ticketId));

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/dashboard/$guildId/tickets"
        params={{ guildId }}
        search={{ status: 'closed' }}
        className="text-sm text-stone-400 hover:text-white"
      >
        ← Tickets fermés
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Transcript</h2>
        <div className="flex gap-2">
          <a href={url} target="_blank" rel="noreferrer" className={buttonClass('ghost')}>
            Ouvrir dans un onglet
          </a>
          <a href={url} download className={buttonClass('ghost')}>
            Télécharger
          </a>
        </div>
      </div>
      <iframe
        title="Transcript du ticket"
        src={url}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className="h-[75vh] w-full rounded-xl border border-brown bg-ink"
      />
    </section>
  );
}
