import { Link, Outlet, useMatches } from '@tanstack/react-router';
import { UserMenu } from './features/auth/user-menu';

export function RootLayout() {
  // Une page pleine largeur (l'accueil) : l'en-tête s'aligne sur elle, et elle pose ses marges
  const fullWidth = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullWidth === true),
  });
  const container = fullWidth ? 'max-w-6xl px-4 sm:px-6' : 'max-w-5xl px-4';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/8">
        <div className={`mx-auto flex ${container} items-center justify-between gap-4 py-3`}>
          <div className="flex items-center gap-5 sm:gap-7">
            <Link to="/" className="flex items-center gap-2.5 text-white">
              <img src="/logo.png" alt="" className="size-8 rounded-lg" />
              {/* Sur téléphone, le logo seul laisse la place au lien du forum */}
              <span className="hidden font-display text-lg font-semibold tracking-tight sm:inline">
                PhenixMG
              </span>
            </Link>
            <Link
              to="/forum"
              className="text-sm text-stone-300 hover:text-white"
              activeProps={{ className: 'text-white!' }}
            >
              Forum
            </Link>
          </div>
          {/* L'invitation du bot est dans les pages (accueil, choix du serveur) : ici, le compte */}
          <UserMenu />
        </div>
      </header>
      <main className={fullWidth ? 'flex-1' : `mx-auto w-full ${container} flex-1 py-8`}>
        <Outlet />
      </main>
    </div>
  );
}

export function NotFound() {
  return (
    <section className="py-20 text-center">
      <h1 className="text-2xl font-bold text-white">Page introuvable</h1>
      <Link to="/" className="text-gold underline">
        Retour à l'accueil
      </Link>
    </section>
  );
}
