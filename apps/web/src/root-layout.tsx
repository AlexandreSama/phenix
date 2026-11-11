import { Link, Outlet } from '@tanstack/react-router';

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-brown">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-white">
            <img src="/logo.png" alt="" className="size-8" />
            {/* Sur téléphone, le logo seul laisse la place au lien du forum */}
            <span className="hidden sm:inline">PhenixMG</span>
          </Link>
          <Link
            to="/forum"
            className="text-sm text-stone-300 hover:text-white"
            activeProps={{ className: 'text-white!' }}
          >
            Forum
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
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
