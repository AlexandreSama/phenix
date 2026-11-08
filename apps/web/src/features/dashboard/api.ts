import type {
  GeneralConfig,
  GeneralConfigPatch,
  GuildChannelSummary,
  GuildRoleSummary,
  ManageableGuild,
} from '@phenix/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { LevelingConfig, LevelingConfigPatch } from '@phenix/shared';
import type { RolePanelDetail, RolePanelInput, RolePanelSummary } from '@phenix/shared';

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

export const levelingQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'leveling'],
    queryFn: () => api<LevelingConfig>(`/guilds/${guildId}/leveling`),
  });

export function useUpdateLeveling(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: LevelingConfigPatch) =>
      api<LevelingConfig>(`/guilds/${guildId}/leveling`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: async (config) => {
      queryClient.setQueryData(levelingQuery(guildId).queryKey, config);
      // Le classement public a pu changer de visibilité
      await queryClient.invalidateQueries({ queryKey: ['leaderboard', guildId] });
    },
  });
}

export const rolePanelsQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'role-panels'],
    queryFn: () => api<RolePanelSummary[]>(`/guilds/${guildId}/role-panels`),
    // Le bot confirme la publication après coup : on relit toutes les 2 s tant qu'un panel attend
    refetchInterval: (query) =>
      query.state.data?.some((panel) => panel.status === 'pending') ? 2000 : false,
  });

export const rolePanelQuery = (guildId: string, panelId: number) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'role-panels', panelId],
    queryFn: () => api<RolePanelDetail>(`/guilds/${guildId}/role-panels/${panelId}`),
  });

/** Crée le panel (sans id) ou le remplace ; dans les deux cas le bot le publie. */
export function useSaveRolePanel(guildId: string, panelId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RolePanelInput) =>
      api<RolePanelDetail>(
        panelId === undefined
          ? `/guilds/${guildId}/role-panels`
          : `/guilds/${guildId}/role-panels/${panelId}`,
        { method: panelId === undefined ? 'POST' : 'PUT', body: JSON.stringify(input) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'role-panels'] }),
  });
}

export function useDeleteRolePanel(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (panelId: number) =>
      api<void>(`/guilds/${guildId}/role-panels/${panelId}`, { method: 'DELETE' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'role-panels'] }),
  });
}
