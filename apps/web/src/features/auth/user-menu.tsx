import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../components/icon';
import { buttonClass } from '../../components/ui/button';
import { currentUserQuery, LOGIN_URL, logout } from './api';

const itemClass =
  'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-stone-200 outline-none transition hover:bg-white/6 hover:text-white focus-visible:bg-white/8 focus-visible:text-white disabled:opacity-50';
/** La page ouverte : son choix reste marqué (le Link pose aussi aria-current="page") */
const activeItemClass = 'bg-white/6 text-white';

/**
 * Le compte de l'utilisateur, en haut à droite : un bouton (avatar et pseudo) qui ouvre un menu.
 * Clavier : flèches pour passer d'un choix à l'autre, Échap pour refermer, comme un menu natif.
 */
export function UserMenu() {
  const { data: user } = useQuery(currentUserQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setOpen(false);
      queryClient.clear();
      await navigate({ to: '/' });
    },
  });

  const items = () =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  // Une autre page s'ouvre : le menu se referme
  useEffect(() => setOpen(false), [pathname]);

  // Ouvert : le premier choix prend le focus, et un clic ailleurs dans la page le referme
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') focus(index + 1);
    else if (event.key === 'ArrowUp') focus(index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(list.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    // Tab : le focus poursuit son chemin dans la page, le menu n'a plus lieu d'être
    else if (event.key === 'Tab') setOpen(false);
  };

  if (!user) {
    return (
      <a href={LOGIN_URL} className={buttonClass('ghost', 'whitespace-nowrap')}>
        {/* Sur téléphone, l'en-tête garde ses liens sur une ligne : « Se connecter » suffit */}
        Se connecter <span className="max-sm:hidden">avec Discord</span>
      </a>
    );
  }

  const label = `Menu de ${user.username}`;

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex min-h-11 items-center gap-2.5 rounded-xl py-1.5 pr-2.5 pl-1.5 text-sm text-stone-200 transition hover:bg-white/6 hover:text-white focus-visible:outline-2 focus-visible:outline-gold aria-expanded:bg-white/8 aria-expanded:text-white"
      >
        <img src={user.avatarUrl} alt="" className="size-8 rounded-full" />
        {/* Sur téléphone, l'avatar seul : le pseudo est dans le menu */}
        <span className="max-w-40 truncate font-medium max-sm:hidden">{user.username}</span>
        <Icon
          name="chevronDown"
          className={`size-4 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-64 rounded-2xl border border-white/10 bg-surface-raised p-1.5 shadow-[0_24px_64px_rgb(0_0_0/0.5)]">
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
            <img src={user.avatarUrl} alt="" className="size-10 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-medium text-white">{user.username}</p>
              <p className="text-xs text-stone-400">
                {user.isOwner ? 'Propriétaire du bot' : 'Connecté avec Discord'}
              </p>
            </div>
          </div>
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className="flex flex-col gap-0.5 border-t border-white/8 pt-1.5"
          >
            {user.isOwner && (
              <Link
                to="/admin"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className={itemClass}
                activeProps={{ className: activeItemClass }}
              >
                <Icon name="shield" className="size-4.5 text-stone-400" />
                Administration
              </Link>
            )}
            <Link
              to="/dashboard"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={itemClass}
              activeProps={{ className: activeItemClass }}
            >
              <Icon name="sliders" className="size-4.5 text-stone-400" />
              Ouvrir le tableau de bord
            </Link>
            <div role="separator" className="mx-1.5 my-1 h-px bg-white/8" />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => signOut.mutate()}
              disabled={signOut.isPending}
              className={itemClass}
            >
              <Icon name="logout" className="size-4.5 text-stone-400" />
              {signOut.isPending ? 'Déconnexion…' : 'Déconnexion'}
            </button>
          </div>
          {signOut.error && (
            <p role="alert" className="px-3 pt-1 pb-2 text-[13px] text-flame">
              {signOut.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
