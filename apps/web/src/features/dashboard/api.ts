import type {
  GeneralConfig,
  GeneralConfigPatch,
  GuildChannelSummary,
  GuildRoleSummary,
  ManageableGuild,
} from '@phenix/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const guildsQuery = queryOptions({
  queryKey: ['guilds'],
  queryFn: () => api<ManageableGuild[]>('/guilds'),
});

export const channelsQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'channels'],
    queryFn: () => api<GuildChannelSummary[]>(`/guilds/${guildId}/channels`),
  });

export const rolesQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'roles'],
    queryFn: () => api<GuildRoleSummary[]>(`/guilds/${guildId}/roles`),
  });

export const configQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'config'],
    queryFn: () => api<GeneralConfig>(`/guilds/${guildId}/config`),
  });

export function useUpdateConfig(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: GeneralConfigPatch) =>
      api<GeneralConfig>(`/guilds/${guildId}/config`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    // La réponse est la config enregistrée : on la range directement dans le cache
    onSuccess: (config) => queryClient.setQueryData(configQuery(guildId).queryKey, config),
  });
}
