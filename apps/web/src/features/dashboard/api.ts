import type {
  CasePage,
  CaseStatusKey,
  CaseTypeKey,
  DashboardModuleKey,
  GeneralConfig,
  GeneralConfigPatch,
  GiveawayInput,
  GiveawayPage,
  GiveawaySummary,
  GuildCategorySummary,
  GuildChannelSummary,
  GuildDelegate,
  GuildMemberResult,
  GuildRoleSummary,
  LevelingConfig,
  LevelingConfigPatch,
  ManageableGuild,
  MemberModeration,
  RolePanelDetail,
  RolePanelInput,
  RolePanelSummary,
  Td2EventSummary,
  Td2Settings,
  Td2SettingsInput,
  TicketPage,
  TicketSettings,
  TicketSettingsInput,
  TicketSettingsResponse,
  WelcomeSettings,
} from '@phenix/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
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

export const welcomeQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'welcome'],
    queryFn: () => api<WelcomeSettings>(`/guilds/${guildId}/welcome`),
  });

export function useUpdateWelcome(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: WelcomeSettings) =>
      api<WelcomeSettings>(`/guilds/${guildId}/welcome`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    // La réponse est la config enregistrée : on la range directement dans le cache
    onSuccess: (settings) => queryClient.setQueryData(welcomeQuery(guildId).queryKey, settings),
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

export const td2SettingsQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'td2', 'settings'],
    queryFn: () => api<Td2Settings>(`/guilds/${guildId}/td2/settings`),
  });

export function useSaveTd2Settings(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Td2SettingsInput) =>
      api<Td2Settings>(`/guilds/${guildId}/td2/settings`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (settings) => queryClient.setQueryData(td2SettingsQuery(guildId).queryKey, settings),
  });
}

/** Les inscriptions se font sur Discord : la liste se relit toutes les 30 secondes. */
export const td2EventsQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'td2', 'events'],
    queryFn: () => api<Td2EventSummary[]>(`/guilds/${guildId}/td2/events`),
    refetchInterval: 30_000,
  });

// ---------- Accès délégués (onglet Accès, administrateurs seulement) ----------

export const delegatesQuery = (guildId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'delegates'],
    queryFn: () => api<GuildDelegate[]>(`/guilds/${guildId}/delegates`),
  });

/** Les membres dont le pseudo commence par `search` ; rien avant deux lettres. */
export const memberSearchQuery = (guildId: string, search: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'members', search.toLowerCase()],
    queryFn: () =>
      api<GuildMemberResult[]>(`/guilds/${guildId}/members?q=${encodeURIComponent(search)}`),
    enabled: search.length >= 2,
    // Les résultats précédents restent affichés pendant la frappe suivante
    placeholderData: keepPreviousData,
  });

export function useSaveDelegate(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, modules }: { userId: string; modules: DashboardModuleKey[] }) =>
      api<GuildDelegate>(`/guilds/${guildId}/delegates/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ modules }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: delegatesQuery(guildId).queryKey }),
  });
}

export function useRemoveDelegate(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/guilds/${guildId}/delegates/${userId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: delegatesQuery(guildId).queryKey }),
  });
}

/** Les filtres de la liste des sanctions, tels que l'adresse de la page les porte. */
export interface CaseFilters {
  type?: CaseTypeKey;
  status?: CaseStatusKey;
  moderatorId?: string;
  targetId?: string;
  q?: string;
  /** AAAA-MM-JJ */
  from?: string;
  to?: string;
}

/** Les filtres posés, dans un ordre fixe, puis la page : une seule adresse par recherche. */
function caseParams(filters: CaseFilters, page: number): string {
  const params = new URLSearchParams();
  for (const key of ['type', 'status', 'moderatorId', 'targetId', 'q', 'from', 'to'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  params.set('page', String(page));
  return params.toString();
}

export const casesQuery = (guildId: string, filters: CaseFilters, page: number) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'moderation', 'cases', filters, page],
    queryFn: () =>
      api<CasePage>(`/guilds/${guildId}/moderation/cases?${caseParams(filters, page)}`),
    // Pendant le changement de page ou de filtre, la liste précédente reste affichée
    placeholderData: keepPreviousData,
    // Les sanctions se prennent sur Discord : la liste se rafraîchit seule
    refetchInterval: 30_000,
  });

export const memberModerationQuery = (guildId: string, userId: string) =>
  queryOptions({
    queryKey: ['guilds', guildId, 'moderation', 'members', userId],
    queryFn: () =>
      api<MemberModeration>(`/guilds/${guildId}/moderation/members/${encodeURIComponent(userId)}`),
    refetchInterval: 30_000,
  });
