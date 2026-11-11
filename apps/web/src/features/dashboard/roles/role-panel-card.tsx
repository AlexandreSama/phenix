import type { GuildChannelSummary, RolePanelSummary } from '@phenix/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Button, buttonClass } from '../../../components/ui/button';
import { PublicationBadge } from '../publication-badge';

interface Props {
  guildId: string;
  panel: RolePanelSummary;
  channel: GuildChannelSummary | undefined;
  onDelete: () => Promise<unknown>;
}

export function RolePanelCard({ guildId, panel, channel, onDelete }: Props) {
  // Supprimer demande un second clic : pas de fenêtre de confirmation qui bloque la page
  const [confirming, setConfirming] = useState(false);

  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 transition sm:flex-row sm:items-center ${
        confirming ? 'border-flame/50' : 'border-white/8'
      }`}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-flame/12 text-flame max-sm:hidden">
        <Icon name="tag" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold text-white">{panel.title}</h3>
          <PublicationBadge status={panel.status} />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-stone-400">
          <span>#{channel?.name ?? 'salon supprimé'}</span>
          <span aria-hidden="true">·</span>
          <span>
            {panel.optionCount} {panel.optionCount > 1 ? 'rôles' : 'rôle'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{panel.mode === 'UNIQUE' ? 'un seul rôle à la fois' : 'plusieurs rôles'}</span>
        </p>
        {panel.publishError && (
          <p role="alert" className="text-sm text-flame">
            {panel.publishError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button onClick={() => void onDelete()}>Confirmer la suppression</Button>
          </>
        ) : (
          <>
            <Link
              to="/dashboard/$guildId/roles/$panelId"
              params={{ guildId, panelId: String(panel.id) }}
              className={buttonClass('ghost')}
            >
              <Icon name="pencil" className="size-4" />
              Modifier <span className="sr-only">{panel.title}</span>
            </Link>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Icon name="trash" className="size-4" />
              Supprimer <span className="sr-only">{panel.title}</span>
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
