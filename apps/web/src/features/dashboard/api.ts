import type {
  GeneralConfig,
  GeneralConfigPatch,
  GuildChannelSummary,
  GuildRoleSummary,
  ManageableGuild,
  GiveawayInput,
  GiveawayPage,
  GiveawaySummary,
} from '@phenix/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { LevelingConfig, LevelingConfigPatch } from '@phenix/shared';
import type { RolePanelDetail, RolePanelInput, RolePanelSummary } from '@phenix/shared';
import type {
  GuildCategorySummary,
  TicketPage,
  TicketSettings,
  TicketSettingsInput,
  TicketSettingsResponse,
} from '@phenix/shared';

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

export const categoriesQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'categories'],
    queryFn: () => api<GuildCategorySummary[]>(`/guilds/${guildId}/categories`),
  });

export const ticketSettingsQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'tickets', 'settings'],
    queryFn: () => api<TicketSettingsResponse>(`/guilds/${guildId}/tickets/settings`),
    // Même règle que les panels de rôles : on relit tant que le bot n'a pas confirmé
    refetchInterval: (query) =>
      query.state.data?.settings?.panelStatus === 'pending' ? 2000 : false,
  });

export function useSaveTicketSettings(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TicketSettingsInput) =>
      api<TicketSettings>(`/guilds/${guildId}/tickets/settings`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    // La réponse est « en attente » : la query se remet à relire toutes les 2 s
    onSuccess: (settings) =>
      queryClient.setQueryData(ticketSettingsQuery(guildId).queryKey, { settings }),
  });
}

export type TicketStatusFilter = 'open' | 'closed';

export const ticketsQuery = (guildId: string, status: TicketStatusFilter, page: number) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'tickets', status, page],
    queryFn: () => api<TicketPage>(`/guilds/${guildId}/tickets?status=${status}&page=${page}`),
    placeholderData: keepPreviousData,
    // Les tickets s'ouvrent et se ferment sur Discord : la liste se rafraîchit seule
    refetchInterval: 30_000,
  });

/** Adresse du transcript, servie par l'API ; le cookie de session suit, même dans une iframe. */
export const transcriptUrl = (guildId: string, ticketId: number) =>
  `/api/guilds/${guildId}/tickets/${ticketId}/transcript`;

export type GiveawayStatusFilter = 'active' | 'ended';

/** Le bot n'a pas encore fini : publication, tirage ou annonce en cours. */
export function isGiveawayBusy(giveaway: GiveawaySummary, now = Date.now()): boolean {
  if (giveaway.publication === 'pending') return true;
  if (!giveaway.endedAt) return Date.parse(giveaway.endsAt) <= now;
  return !giveaway.announced && !giveaway.publishError;
}

export const giveawaysQuery = (guildId: string, status: GiveawayStatusFilter, page: number) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'giveaways', status, page],
    queryFn: () => api<GiveawayPage>(`/guilds/${guildId}/giveaways?status=${status}&page=${page}`),
    placeholderData: keepPreviousData,
    // Toutes les 2 s tant que le bot travaille ; sinon de quoi suivre les participations
    refetchInterval: (query) =>
      query.state.data?.giveaways.some((giveaway) => isGiveawayBusy(giveaway)) ? 2000 : 15_000,
  });

const invalidateGiveaways = (queryClient: ReturnType<typeof useQueryClient>, guildId: string) =>
  queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'giveaways'] });

export function useCreateGiveaway(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GiveawayInput) =>
      api<GiveawaySummary>(`/guilds/${guildId}/giveaways`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateGiveaways(queryClient, guildId),
  });
}

export type GiveawayAction = 'end' | 'reroll' | 'delete';

/** Terminer, relancer ou supprimer : le bot fait le travail, la liste se relit ensuite. */
export function useGiveawayAction(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: GiveawayAction }) =>
      action === 'delete'
        ? api<void>(`/guilds/${guildId}/giveaways/${id}`, { method: 'DELETE' })
        : api<void>(`/guilds/${guildId}/giveaways/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => invalidateGiveaways(queryClient, guildId),
  });
}
