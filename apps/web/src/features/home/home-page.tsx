import { Link, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { buttonClass } from '../../components/ui/button';
import { Icon, type IconName } from '../../components/icon';
import { RaidPreview } from './raid-preview';
import { SettingsPreview } from './settings-preview';

const MESSAGES: Record<string, string> = {
  refusee: 'Connexion annulée ou refusée par Discord. Tu peux réessayer.',
  requise: 'Connecte-toi pour accéder au tableau de bord.',
};

/** La largeur de la page : la même que l'en-tête des pages pleine largeur (root-layout.tsx). */
const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

interface Feature {
  icon: IconName;
  title: string;
  description: string;
  /** Les commandes slash du module ; sans commande, ce qui le décrit en deux mots */
  commands?: string[];
  tags?: string[];
}

const FEATURES: Feature[] = [
  {
    icon: 'shield',
    title: 'Modération',
    description:
      "Avertissements, mutes, expulsions et bannissements. Chaque sanction a son numéro, l'historique de chaque membre reste consultable.",
    commands: ['/warn', '/mute', '/ban', '/sanctions'],
  },
  {
    icon: 'chart',
    title: 'Niveaux et classement',
    description:
      "Les membres gagnent de l'XP en discutant. Carte de rang sur Discord, et un classement public sur le site si tu le souhaites.",
    commands: ['/rank', '/leaderboard'],
  },
  {
    icon: 'ticket',
    title: 'Tickets',
    description:
      'Un panneau avec un bouton\u00a0: chaque demande ouvre un salon privé avec le staff. À la fermeture, la transcription est archivée.',
    tags: ['Salon privé', 'Transcription'],
  },
  {
    icon: 'gift',
    title: 'Giveaways',
    description:
      'Tirage à la date choisie, participation en un clic. Un gagnant ne répond pas\u00a0? Tu relances le tirage.',
    commands: ['/giveaway'],
  },
  {
    icon: 'tag',
    title: 'Rôles en libre-service',
    description:
      'Des panneaux de boutons où chacun prend ou retire ses rôles lui-même, sans passer par le staff.',
    commands: ['/gestionrole'],
  },
  {
    icon: 'dice',
    title: 'Fun et utilitaires',
    description:
      'De quoi animer le salon général, et les infos utiles sur le serveur et ses membres.',
    commands: ['/8ball', '/ship', '/avatar', '/serverinfos'],
  },
];

const command = (name: string) => (
  <code className="font-mono text-[0.9em] text-stone-200">{name}</code>
);

const TD2_POINTS: { icon: IconName; title: string; text: ReactNode }[] = [
  {
    icon: 'users',
    title: 'Inscriptions par rôle.',
    text: "DPS, Heal ou Tank selon la composition de l'activité. Un rôle complet\u00a0? La réserve prend le relais toute seule.",
  },
  {
    icon: 'crosshair',
    title: 'Missions à la carte.',
    text: (
      <>
        {command('/td2 mission')}&nbsp;: tu la nommes, choisis la difficulté et les directives qui
        la corsent.
      </>
    ),
  },
  {
    icon: 'bell',
    title: "Rappel un quart d'heure avant.",
    text: "Les inscrits sont prévenus, personne n'arrive en retard.",
  },
  {
    icon: 'flag',
    title: 'Signalements.',
    text: <>Un joueur pose problème&nbsp;? {command('/td2 signaler')} prévient ton staff.</>,
  },
  {
    icon: 'pulse',
    title: "Statistiques d'agent.",
    text: <>{command('/td2 stats')} affiche le profil d'un joueur, via Tracker Network.</>,
  },
];

/** Le catalogue de départ (seed) ; le propriétaire du bot peut en ajouter depuis /admin. */
const TD2_ACTIVITIES = [
  { name: 'Dark Hours', kind: 'Raid · 8 joueurs', modes: ['Normal', 'Semi-Speed'] },
  { name: 'Iron Horse', kind: 'Raid · 8 joueurs', modes: ['Normal', 'Semi-Speed'] },
  { name: 'Paradis Perdu', kind: 'Incursion · 4 joueurs', modes: ['Standard'] },
  { name: 'Broken Rain', kind: 'Incursion · 4 joueurs', modes: ['Standard'] },
  { name: 'Missions', kind: '1 à 4 joueurs · nom libre', modes: ['Difficulté', 'Directives'] },
];

function Eyebrow({ children, tone = 'flame' }: { children: ReactNode; tone?: 'flame' | 'gold' }) {
  return (
    <p
      className={`text-sm font-semibold tracking-widest uppercase ${tone === 'gold' ? 'text-gold' : 'text-flame'}`}
    >
      {children}
    </p>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance text-white sm:text-[44px] sm:leading-[1.1]"
    >
      {children}
    </h2>
  );
}

function InviteLink() {
  return (
    <a href="/api/invite" className={buttonClass('primary', '', 'lg')}>
      <Icon name="plus" />
      Inviter le bot
    </a>
  );
}

function Hero({ message }: { message: string | undefined }) {
  return (
    <section
      className={`${CONTAINER} grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16`}
    >
      <div className="flex flex-col items-start gap-7">
        <p className="inline-flex items-center gap-2.5 rounded-full border border-white/12 py-1.5 pr-3.5 pl-2.5 text-sm font-medium text-stone-300">
          <span aria-hidden="true" className="size-2 rounded-full bg-gold" />
          Bot Discord, commandes en français
        </p>
        <h1 className="font-display text-[40px] leading-[1.05] font-semibold tracking-tight text-balance text-white sm:text-6xl lg:text-[68px]">
          Un seul bot pour tenir ton serveur{' '}
          <span className="text-flame">et organiser tes raids.</span>
        </h1>
        <p className="max-w-xl text-lg text-pretty text-stone-300">
          Modération, niveaux, tickets, giveaways, rôles et sorties The Division 2. Tu règles tout
          depuis le tableau de bord du site, le bot applique sans redémarrer.
        </p>
        {message && (
          <p role="status" className="rounded-lg border border-ember bg-ember/10 px-4 py-2 text-sm">
            {message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <InviteLink />
          <Link to="/dashboard" className={buttonClass('ghost', '', 'lg')}>
            Ouvrir le tableau de bord
            <Icon name="arrowRight" className="size-4.5" />
          </Link>
        </div>
        <p className="text-sm text-stone-400">
          Connexion avec ton compte Discord, rien à installer.
        </p>
      </div>
      <RaidPreview />
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-white/8 bg-surface p-6 sm:p-7">
      <span className="flex size-11 items-center justify-center rounded-xl bg-flame/15 text-flame">
        <Icon name={feature.icon} className="size-5.5" />
      </span>
      <h3 className="font-display text-xl font-semibold text-white">{feature.title}</h3>
      <p className="text-[15px] text-stone-300">{feature.description}</p>
      <ul
        aria-label={feature.commands ? 'Commandes' : 'En bref'}
        className="mt-auto flex flex-wrap gap-1.5 pt-1.5"
      >
        {feature.commands?.map((name) => (
          <li key={name}>
            <code className="rounded-md bg-white/6 px-2 py-1 font-mono text-[13px] text-stone-200">
              {name}
            </code>
          </li>
        ))}
        {feature.tags?.map((tag) => (
          <li
            key={tag}
            className="rounded-md border border-white/10 px-2.5 py-1 text-[13px] text-stone-300"
          >
            {tag}
          </li>
        ))}
      </ul>
    </article>
  );
}

function FeaturesSection() {
  return (
    <section
      id="fonctionnalites"
      aria-labelledby="fonctionnalites-titre"
      className={`${CONTAINER} scroll-mt-6 pt-6 pb-20 sm:pb-28`}
    >
      <div className="mb-12 flex max-w-2xl flex-col gap-3.5">
        <Eyebrow>Fonctionnalités</Eyebrow>
        <SectionTitle id="fonctionnalites-titre">
          Ce qu'un serveur actif demande, au même endroit
        </SectionTitle>
        <p className="text-[17px] text-stone-300">
          Des commandes slash en français côté Discord, et des réglages que tu changes depuis le
          site.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}

function Td2Section() {
  return (
    <section
      id="td2"
      aria-labelledby="td2-titre"
      className="scroll-mt-6 border-y border-white/6 bg-band"
    >
      <div
        className={`${CONTAINER} grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16`}
      >
        <div className="flex flex-col gap-6">
          <Eyebrow tone="gold">The Division 2</Eyebrow>
          <SectionTitle id="td2-titre">
            Des sorties organisées, pas un fil de messages à démêler
          </SectionTitle>
          <p className="text-[17px] text-stone-300">
            Le bot publie la sortie, tient la liste des inscrits et prévient tout le monde avant le
            départ.
          </p>
          <ul className="flex flex-col gap-4.5">
            {TD2_POINTS.map((point) => (
              <li key={point.title} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/12 text-gold">
                  <Icon name={point.icon} className="size-4.5" />
                </span>
                <p>
                  <strong className="font-semibold text-white">{point.title}</strong>{' '}
                  <span className="text-stone-300">{point.text}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface-raised p-2">
          <h3 className="px-4 pt-4 pb-3 font-display text-lg font-semibold text-white">
            Raids, incursions et missions
          </h3>
          <ul className="flex flex-col gap-1">
            {TD2_ACTIVITIES.map((activity) => (
              <li
                key={activity.name}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-white/4 px-4 py-4"
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-white">{activity.name}</span>
                  <span className="text-sm text-stone-400">{activity.kind}</span>
                </span>
                <span className="flex gap-1.5">
                  {activity.modes.map((mode) => (
                    <span
                      key={mode}
                      className="rounded-full border border-white/12 px-2.5 py-0.5 text-sm text-stone-300"
                    >
                      {mode}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-4 pt-3.5 pb-3 text-sm text-stone-400">
            Raid Normal&nbsp;: 6 DPS, 1 Heal, 1 Tank. Semi-Speed&nbsp;: 5 DPS, 1 Heal, 2 Tank.
            Incursion&nbsp;: 3 DPS et 1 Heal ou Tank.
          </p>
          <Link
            to="/sorties"
            className="mx-2 mb-2 flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/8 px-4 py-3.5 text-sm font-semibold text-gold transition hover:border-gold/50"
          >
            Voir les sorties en cours sur le réseau
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function DashboardSection() {
  return (
    <section
      id="tableau-de-bord"
      aria-labelledby="tableau-de-bord-titre"
      className={`${CONTAINER} grid scroll-mt-6 items-center gap-14 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16`}
    >
      {/* Sur téléphone, le texte passe d'abord ; min-w-0 : les onglets de l'aperçu ne débordent pas */}
      <div className="order-2 min-w-0 lg:order-1">
        <SettingsPreview />
      </div>
      <div className="order-1 flex flex-col items-start gap-6 lg:order-2">
        <Eyebrow>Tableau de bord</Eyebrow>
        <SectionTitle id="tableau-de-bord-titre">Tout se règle depuis le site</SectionTitle>
        <p className="text-[17px] text-stone-300">
          Tu te connectes avec Discord, tu choisis ton serveur, tu changes un réglage&nbsp;: le bot
          le prend en compte tout de suite. Salons, rôles, XP, tickets, giveaways et sorties TD2,
          chaque module a son onglet.
        </p>
        <Link to="/dashboard" className={buttonClass('ghost', '', 'lg')}>
          Ouvrir le tableau de bord
          <Icon name="arrowRight" className="size-4.5" />
        </Link>
      </div>
    </section>
  );
}

function ForumBand() {
  return (
    <section aria-labelledby="forum-titre" className={`${CONTAINER} pb-20 sm:pb-28`}>
      <div className="flex flex-wrap items-center justify-between gap-7 rounded-3xl border border-white/8 bg-surface p-7 sm:p-12">
        <div className="flex max-w-2xl items-start gap-5">
          <span className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-gold/12 text-gold">
            <Icon name="forum" className="size-6" />
          </span>
          <div className="flex flex-col gap-2">
            <h2
              id="forum-titre"
              className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[26px]"
            >
              Le forum de la communauté
            </h2>
            <p className="text-stone-300">
              Des catégories, des sujets et des images, pour les discussions qui méritent mieux
              qu'un salon qui défile.
            </p>
          </div>
        </div>
        <Link to="/forum" className={buttonClass('ghost', '', 'lg')}>
          Visiter le forum
          <Icon name="arrowRight" className="size-4.5" />
        </Link>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section aria-labelledby="inviter-titre" className="border-t border-white/6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 sm:py-28">
        <img src="/logo.png" alt="" className="size-18 rounded-2xl" />
        <h2
          id="inviter-titre"
          className="font-display text-[32px] leading-tight font-semibold tracking-tight text-balance text-white sm:text-5xl"
        >
          Ajoute PhenixMG à ton serveur
        </h2>
        <p className="text-[17px] text-stone-300">
          L'invitation prend un clic. Le reste se règle depuis le tableau de bord, à ton rythme.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <InviteLink />
          <Link to="/dashboard" className={buttonClass('ghost', '', 'lg')}>
            Ouvrir le tableau de bord
          </Link>
        </div>
      </div>
    </section>
  );
}

function HomeFooter() {
  return (
    <footer className="border-t border-white/8">
      <div className={`${CONTAINER} flex flex-col gap-7 pt-10 pb-12`}>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <Link to="/" className="flex items-center gap-2.5 text-white">
            <img src="/logo.png" alt="" className="size-7 rounded-lg" />
            <span className="font-display text-[17px] font-semibold">PhenixMG</span>
          </Link>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-x-6 text-sm">
            <a href="#fonctionnalites" className="py-2.5 text-stone-300 hover:text-white">
              Fonctionnalités
            </a>
            <a href="#td2" className="py-2.5 text-stone-300 hover:text-white">
              The Division 2
            </a>
            <Link to="/sorties" className="py-2.5 text-stone-300 hover:text-white">
              Sorties en cours
            </Link>
            <Link to="/dashboard" className="py-2.5 text-stone-300 hover:text-white">
              Tableau de bord
            </Link>
            <Link to="/forum" className="py-2.5 text-stone-300 hover:text-white">
              Forum
            </Link>
            <a href="/api/invite" className="py-2.5 text-stone-300 hover:text-white">
              Inviter le bot
            </a>
          </nav>
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-white/6 pt-5 text-[13px] text-stone-400">
          <p>Statistiques The Division 2 fournies par Tracker Network.</p>
          <p>PhenixMG n'est affilié ni à Discord, ni à Ubisoft.</p>
        </div>
      </div>
    </footer>
  );
}

export function HomePage() {
  const { connexion } = useSearch({ from: '/' });
  const message = connexion ? MESSAGES[connexion] : undefined;

  return (
    <>
      <Hero message={message} />
      <FeaturesSection />
      <Td2Section />
      <DashboardSection />
      <ForumBand />
      <FinalCta />
      <HomeFooter />
    </>
  );
}
