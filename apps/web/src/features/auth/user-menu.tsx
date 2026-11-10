import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonClass } from '../../components/ui/button';
import { currentUserQuery, LOGIN_URL, logout } from './api';

export function UserMenu() {
  const { data: user } = useQuery(currentUserQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: '/' });
    },
  });

  if (!user) {
    return (
      <a href={LOGIN_URL} className={buttonClass('primary')}>
        Se connecter avec Discord
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <img src={user.avatarUrl} alt="" className="size-8 rounded-full" />
      <span className="hidden text-sm sm:inline">{user.username}</span>
      {user.isOwner && (
        <Link
          to="/admin"
          aria-label="Administration"
          className="text-sm text-stone-300 hover:text-white"
          activeProps={{ className: 'text-white!' }}
        >
          {/* Sur téléphone, le mot entier pousse l'en-tête hors de l'écran */}
          <span className="sm:hidden">Admin</span>
          <span className="hidden sm:inline">Administration</span>
        </Link>
      )}
      <Button variant="ghost" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
        Déconnexion
      </Button>
    </div>
  );
}
