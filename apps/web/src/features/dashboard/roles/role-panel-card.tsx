import type { GuildChannelSummary, PublicationStatus, RolePanelSummary } from '@phenix/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, buttonClass } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

const STATUS: Record<PublicationStatus, { label: string; className: string }> = {
  published: { label: 'Publié', className: 'border-gold/60 text-gold' },
  pending: { label: 'Publication…', className: 'border-stone-500 text-stone-300' },
  error: { label: 'Erreur', className: 'border-flame text-flame' },
};

interface Props {
  guildId: string;
  panel: RolePanelSummary;
  channel: GuildChannelSummary | undefined;
  onDelete: () => Promise<unknown>;
}

export function RolePanelCard({ guildId, panel, channel, onDelete }: Props) {
  // Supprimer demande un second clic : pas de fenêtre de confirmation qui bloque la page
  const [confirming, setConfirming] = useState(false);
  const status = STATUS[panel.status];

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate font-semibold text-white">{panel.title}</h2>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${status.className}`}>
            {status.label}
          </span>
        </div>
        <p className="text-sm text-stone-400">
          #{channel?.name ?? 'salon supprimé'} · {panel.optionCount}{' '}
          {panel.optionCount > 1 ? 'rôles' : 'rôle'} ·{' '}
          {panel.mode === 'UNIQUE' ? 'un seul rôle' : 'plusieurs rôles'}
        </p>
        {panel.publishError && (
          <p role="alert" className="mt-1 text-sm text-flame">
            {panel.publishError}
          </p>
        )}
      </div>
      <div className="flex gap-2">
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
              Modifier
            </Link>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Supprimer
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
