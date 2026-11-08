import type { CurrentUser } from '@phenix/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';

/** L'utilisateur connecté, ou null s'il ne l'est pas. */
export const currentUserQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<CurrentUser | null> => {
    try {
      return await api<CurrentUser>('/auth/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 5 * 60_000,
});

export function logout(): Promise<void> {
  return api<void>('/auth/logout', { method: 'POST' });
}

/** La connexion passe par l'API, qui redirige vers Discord : un simple lien suffit. */
export const LOGIN_URL = '/api/auth/discord';
