interface Props {
  title: string;
  description: string;
  buttonLabel: string;
}

/** Le panel tel que le bot le postera : un embed et un bouton bleu « 🎫 ». */
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
        <span className="mt-2 inline-block rounded bg-[#5865f2] px-3 py-1.5 text-sm font-medium text-white">
          🎫 {buttonLabel || 'Ouvrir un ticket'}
        </span>
      </div>
    </figure>
  );
}
