import type {
  ForumCategoryInput,
  ForumCategorySummary,
  ForumMember,
  ForumRoleKey,
} from '@phenix/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

export const forumAdminCategoriesQuery = queryOptions({
  queryKey: ['admin', 'forum', 'categories'],
  queryFn: () => api<ForumCategorySummary[]>('/admin/forum/categories'),
});

export const forumStaffQuery = queryOptions({
  queryKey: ['admin', 'forum', 'staff'],
  queryFn: () => api<ForumMember[]>('/admin/forum/staff'),
});

export const forumMembersQuery = (q: string) =>
  queryOptions({
    queryKey: ['admin', 'forum', 'members', q],
    queryFn: () => api<ForumMember[]>(`/admin/forum/members?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

/** Chaque écriture renvoie la liste à jour : elle remplace celle du cache, et le forum se relit. */
function useCategoryWrite<T>(request: (input: T) => Promise<ForumCategorySummary[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async (categories) => {
      queryClient.setQueryData(forumAdminCategoriesQuery.queryKey, categories);
      await queryClient.invalidateQueries({ queryKey: ['forum'] });
    },
  });
}

export const useCreateForumCategory = () =>
  useCategoryWrite((input: ForumCategoryInput) =>
    api<ForumCategorySummary[]>('/admin/forum/categories', send('POST', input)),
  );

export const useUpdateForumCategory = () =>
  useCategoryWrite(({ id, input }: { id: number; input: ForumCategoryInput }) =>
    api<ForumCategorySummary[]>(`/admin/forum/categories/${id}`, send('PUT', input)),
  );

export const useDeleteForumCategory = () =>
  useCategoryWrite((id: number) =>
    api<ForumCategorySummary[]>(`/admin/forum/categories/${id}`, send('DELETE')),
  );

export function useSetForumRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ForumRoleKey }) =>
      api<ForumMember[]>(`/admin/forum/members/${userId}/role`, send('PUT', { role })),
    onSuccess: async (staff) => {
      queryClient.setQueryData(forumStaffQuery.queryKey, staff);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'forum', 'members'] });
      // Un rôle change ce que voit la personne, et son badge sur le forum
      await queryClient.invalidateQueries({ queryKey: ['forum'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
