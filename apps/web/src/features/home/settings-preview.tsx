import { useId } from 'react';
import { Icon } from '../../components/icon';

/** Les onglets d'un serveur dans le tableau de bord (guild-layout.tsx). */
const TABS = ['Général', 'Niveaux', 'Rôles', 'Tickets', 'Giveaways', 'TD2'];

const SETTINGS = [
  { label: 'Salon de logs de modération', value: '#sanctions' },
  { label: "Salon d'annonces", value: '#annonces' },
];

function FakeSelect({ value }: { value: string }) {
  return (
    <span className="flex min-h-11 items-center justify-between rounded-lg border border-white/12 bg-ink px-3.5 text-[15px] text-stone-100">
      {value}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 text-stone-400"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

/** L'onglet Général du tableau de bord, en illustration : rien n'y est cliquable. */
export function SettingsPreview() {
  const captionId = useId();

  return (
    <figure aria-labelledby={captionId} className="flex flex-col gap-3.5">
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-[0_32px_80px_rgb(0_0_0/0.3)]"
      >
        <div className="flex gap-1 overflow-hidden border-b border-white/8 px-3 text-sm">
          {TABS.map((tab, index) => (
            <span
              key={tab}
              className={`shrink-0 border-b-2 px-2.5 py-3.5 ${
                // Sur téléphone, les quatre premiers onglets suffisent à l'illustration
                index >= 4 ? 'max-sm:hidden' : ''
              } ${
                index === 0
                  ? 'border-flame font-semibold text-white'
                  : 'border-transparent text-stone-400'
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {SETTINGS.map((setting) => (
            <div key={setting.label} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-stone-100">{setting.label}</span>
              <FakeSelect value={setting.value} />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-stone-100">Rôles staff</span>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/8 px-3 py-1.5 text-sm">@Modérateur</span>
              <span className="rounded-full bg-white/8 px-3 py-1.5 text-sm">@Admin</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-stone-100">Fuseau horaire</span>
            <FakeSelect value="Europe/Paris" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
            <span className="rounded-lg bg-flame px-4 py-2.5 text-sm font-semibold text-ink">
              Enregistrer
            </span>
            <span className="flex items-center gap-2 text-sm text-gold">
              <Icon name="check" className="size-4" />
              Enregistré. Le bot applique déjà le changement.
            </span>
          </div>
        </div>
      </div>
      <figcaption id={captionId} className="text-center text-sm text-stone-400">
        L'onglet Général d'un serveur dans le tableau de bord.
      </figcaption>
    </figure>
  );
}
