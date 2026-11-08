import { Link, useSearch } from '@tanstack/react-router';
import { buttonClass } from '../../components/ui/button';

const MESSAGES: Record<string, string> = {
  refusee: 'Connexion annulée ou refusée par Discord. Tu peux réessayer.',
  requise: 'Connecte-toi pour accéder au tableau de bord.',
};

export function HomePage() {
  const { connexion } = useSearch({ from: '/' });
  const message = connexion ? MESSAGES[connexion] : undefined;

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-20 text-center">
      <img src="/logo.png" alt="" className="size-28" />
      <h1 className="text-4xl font-bold text-white">PhenixMG</h1>
      <p className="text-lg text-stone-300">
        Modération, fun et organisation de raids The Division 2, pour ton serveur Discord.
      </p>
      {message && (
        <p role="status" className="rounded-lg border border-ember px-4 py-2 text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <a href="/api/invite" className={buttonClass('primary')}>
          Inviter le bot
        </a>
        <Link to="/dashboard" className={buttonClass('ghost')}>
          Tableau de bord
        </Link>
      </div>
    </section>
  );
}
