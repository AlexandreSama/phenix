import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
      <Button variant="ghost" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
        Déconnexion
      </Button>
    </div>
  );
}
