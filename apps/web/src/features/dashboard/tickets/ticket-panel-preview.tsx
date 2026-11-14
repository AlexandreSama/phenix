interface Props {
  title: string;
  description: string;
  /** Texte du bouton unique */
  buttonLabel: string;
}

const discordButton = 'rounded bg-[#5865f2] px-3 py-1.5 text-sm font-medium text-white';

/** Le panel tel que le bot le postera : un embed et un seul bouton ; le type se choisit au clic. */
export function TicketPanelPreview({ title, description, buttonLabel }: Props) {
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
        <div className="mt-2 flex flex-wrap gap-2">
          <span className={discordButton}>🎫 {buttonLabel || 'Ouvrir un ticket'}</span>
        </div>
      </div>
    </figure>
  );
}
