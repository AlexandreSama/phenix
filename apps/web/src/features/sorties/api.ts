import type { PublicTd2Event } from '@phenix/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Les sorties des serveurs qui se montrent. L'API les garde 30 s ; la page relit chaque minute. */
export const publicEventsQuery = queryOptions({
  queryKey: ['td2', 'public-events'],
  queryFn: () => api<PublicTd2Event[]>('/td2/public/events'),
  refetchInterval: 60_000,
});

/** « Rejoindre ce serveur » : l'API redirige vers l'invitation Discord du moment. */
export const joinUrl = (guildId: string) => `/api/td2/public/guilds/${guildId}/join`;
