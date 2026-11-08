import type { LeaderboardPage } from '@phenix/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const leaderboardQuery = (guildId: string, page: number) =>
  queryOptions({
    queryKey: ['leaderboard', guildId, page],
    queryFn: () => api<LeaderboardPage>(`/leaderboard/${guildId}?page=${page}`),
    // Pendant le chargement de la page suivante, on garde l'ancienne à l'écran
    placeholderData: keepPreviousData,
  });
