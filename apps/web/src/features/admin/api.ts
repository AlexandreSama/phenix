import type {
  Td2ActivityInput,
  Td2ActivityPatch,
  Td2CatalogueActivity,
  Td2ModeInput,
  Td2ReportAdminPage,
  Td2ReportStatusKey,
} from '@phenix/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../../lib/api';

export const catalogueQuery = queryOptions({
  queryKey: ['admin', 'td2', 'catalogue'],
  queryFn: () => api<Td2CatalogueActivity[]>('/admin/td2/catalogue'),
});

/** Chaque écriture du catalogue renvoie le catalogue entier : il remplace celui du cache. */
function useCatalogueWrite<T>(request: (input: T) => Promise<Td2CatalogueActivity[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (catalogue) => queryClient.setQueryData(catalogueQuery.queryKey, catalogue),
  });
}

const send = (path: string, method: string, body?: unknown) =>
  api<Td2CatalogueActivity[]>(path, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

export const useCreateActivity = () =>
  useCatalogueWrite((input: Td2ActivityInput) => send('/admin/td2/activities', 'POST', input));

export const useUpdateActivity = () =>
  useCatalogueWrite(({ id, patch }: { id: number; patch: Td2ActivityPatch }) =>
    send(`/admin/td2/activities/${id}`, 'PATCH', patch),
  );

export const useCreateMode = () =>
  useCatalogueWrite(({ activityId, input }: { activityId: number; input: Td2ModeInput }) =>
    send(`/admin/td2/activities/${activityId}/modes`, 'POST', input),
  );

export const useUpdateMode = () =>
  useCatalogueWrite(({ modeId, input }: { modeId: number; input: Td2ModeInput }) =>
    send(`/admin/td2/modes/${modeId}`, 'PUT', input),
  );

export const useDeleteMode = () =>
  useCatalogueWrite((modeId: number) => send(`/admin/td2/modes/${modeId}`, 'DELETE'));

export interface ReportFilters {
  status?: Td2ReportStatusKey;
  q?: string;
}

/** Les signalements du réseau, 25 par 25 : « Charger plus » demande la page suivante. */
export const reportsQuery = (filters: ReportFilters) =>
  infiniteQueryOptions({
    queryKey: ['admin', 'td2', 'reports', filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.q) params.set('q', filters.q);
      if (pageParam) params.set('cursor', String(pageParam));
      return api<Td2ReportAdminPage>(`/admin/td2/reports?${params.toString()}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/td2/reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'td2', 'reports'] }),
  });
}

/** L'adresse d'une capture : servie par l'API, derrière la session d'un propriétaire. */
export const evidenceUrl = (reportId: number, index: number) =>
  `/api/admin/td2/reports/${reportId}/evidence/${index}`;
