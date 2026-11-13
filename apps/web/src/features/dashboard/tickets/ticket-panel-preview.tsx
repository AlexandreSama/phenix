import type { TicketTypeSummary } from '@phenix/shared';

/** Au-delà de 5 types, le bot passe du bouton au menu déroulant (une rangée de boutons Discord = 5). */
const MAX_BUTTONS = 5;

interface Props {
  title: string;
  description: string;
  /** Invite du menu déroulant */
  buttonLabel: string;
  types: TicketTypeSummary[];
}

const discordButton = 'rounded bg-[#5865f2] px-3 py-1.5 text-sm font-medium text-white';

/** Le panel tel que le bot le postera : un embed, puis un bouton par type (1 à 5) ou un menu (6 à 25). */
export function TicketPanelPreview({ title, description, buttonLabel, types }: Props) {
  return (
    <figure
      aria-label="Aperçu du panel sur Discord"
      className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-surface p-4"
    >
      <figcaption className="text-xs font-semibold tracking-widest text-stone-400 uppercase">
        Aperçu sur Discord
      </figcaption>
      {/* Les couleurs de Discord en thème sombre : l'aperçu ressemble au vrai message */}
      <div className="rounded-xl bg-[#313338] p-4 text-[#dbdee1]">
        <div className="rounded border-l-4 border-flame bg-[#2b2d31] p-3">
          <p className="font-semibold text-white">{title || 'Titre du panel'}</p>
          {description && <p className="mt-1 text-sm whitespace-pre-line">{description}</p>}
        </div>
        {types.length > MAX_BUTTONS ? (
          <div className="mt-2 flex items-center justify-between rounded bg-[#1e1f22] px-3 py-2 text-sm">
            <span>{buttonLabel || 'Ouvrir un ticket'}</span>
            <span className="text-xs text-[#949ba4]">{types.length} types de ticket</span>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {types.length === 0 ? (
              <span className={discordButton}>🎫 {buttonLabel || 'Ouvrir un ticket'}</span>
            ) : (
              types.map((type) => (
                <span key={type.id} className={discordButton}>
                  {type.emoji ? `${type.emoji} ${type.name}` : type.name}
                </span>
              ))
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
