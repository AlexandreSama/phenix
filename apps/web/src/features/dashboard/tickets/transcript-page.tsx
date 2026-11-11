import { Link, useParams } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';
import { PageHeader } from '../../../components/ui/panel';
import { transcriptUrl } from '../api';

/**
 * Le transcript s'affiche dans une iframe « sandbox » : même si un message contenait du HTML
 * qui avait échappé au bot, il ne pourrait ni lancer de script ni lire le cookie du site.
 */
export function TranscriptPage() {
  const { guildId, ticketId } = useParams({ from: '/dashboard/$guildId/tickets/$ticketId' });
  const url = transcriptUrl(guildId, Number(ticketId));

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/dashboard/$guildId/tickets"
        params={{ guildId }}
        search={{ status: 'closed' }}
        className="inline-flex items-center gap-2 self-start text-sm text-stone-400 transition hover:text-white"
      >
        <Icon name="arrowLeft" className="size-4" />
        Tickets fermés
      </Link>
      <PageHeader
        title="Transcript"
        description="Les messages du ticket, tels qu’ils ont été archivés à sa fermeture."
        actions={
          <>
            <a href={url} target="_blank" rel="noreferrer" className={buttonClass('ghost')}>
              <Icon name="external" className="size-4" />
              Ouvrir dans un onglet
            </a>
            <a href={url} download className={buttonClass('ghost')}>
              <Icon name="download" className="size-4" />
              Télécharger
            </a>
          </>
        }
      />
      <figure className="flex flex-col gap-2.5">
        <iframe
          title="Transcript du ticket"
          src={url}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          className="h-[72vh] min-h-96 w-full rounded-2xl border border-white/8 bg-ink"
        />
        <figcaption className="flex items-center gap-2 text-[13px] text-stone-400">
          <Icon name="lock" className="size-3.5" />
          Affiché sans script ni accès au reste du site, par sécurité.
        </figcaption>
      </figure>
    </div>
  );
}
