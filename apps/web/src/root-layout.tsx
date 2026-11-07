import { Link, Outlet } from '@tanstack/react-router';
import { UserMenu } from './features/auth/user-menu';

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-brown">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-white">
            <img src="/logo.png" alt="" className="size-8" />
            PhenixMG
          </Link>
          <UserMenu />
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
