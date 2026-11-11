import type {
  ForumCategoryPage,
  ForumCategorySummary,
  ForumImage,
  ForumMarkdownPreview,
  ForumPostCreated,
  ForumThreadInput,
  ForumThreadModeration,
  ForumThreadView,
} from '@phenix/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const forumCategoriesQuery = queryOptions({
  queryKey: ['forum', 'categories'],
  queryFn: () => api<ForumCategorySummary[]>('/forum/categories'),
});

/** Une page de sujets. La page précédente reste affichée pendant le chargement de la suivante. */
export const forumCategoryQuery = (slug: string, page: number) =>
  queryOptions({
    queryKey: ['forum', 'category', slug, page],
    queryFn: () =>
      api<ForumCategoryPage>(`/forum/categories/${encodeURIComponent(slug)}?page=${page}`),
    placeholderData: keepPreviousData,
  });

export const forumThreadQuery = (threadId: number, page: number) =>
  queryOptions({
    queryKey: ['forum', 'thread', threadId, page],
    queryFn: () => api<ForumThreadView>(`/forum/threads/${threadId}?page=${page}`),
    placeholderData: keepPreviousData,
  });

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

/** Après une écriture, tout ce qui vient du forum se relit : listes, compteurs, sujets. */
function useForumWrite<I, O>(request: (input: I) => Promise<O>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forum'] }),
  });
}

export const useCreateThread = () =>
  useForumWrite((input: ForumThreadInput) =>
    api<ForumPostCreated>('/forum/threads', send('POST', input)),
  );

export const useReply = (threadId: number) =>
  useForumWrite((content: string) =>
    api<ForumPostCreated>(`/forum/threads/${threadId}/posts`, send('POST', { content })),
  );

export const useEditPost = () =>
  useForumWrite(({ postId, content }: { postId: number; content: string }) =>
    api<void>(`/forum/posts/${postId}`, send('PATCH', { content })),
  );

export const useDeletePost = () =>
  useForumWrite((postId: number) => api<void>(`/forum/posts/${postId}`, send('DELETE')));

export const useModerateThread = (threadId: number) =>
  useForumWrite((patch: ForumThreadModeration) =>
    api<void>(`/forum/threads/${threadId}`, send('PATCH', patch)),
  );

/** Le sujet supprimé sort du cache sans être relu : la page part vers sa catégorie. */
export function useDeleteThread(threadId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ categorySlug: string }>(`/forum/threads/${threadId}`, send('DELETE')),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['forum', 'thread', threadId] });
      await queryClient.invalidateQueries({ queryKey: ['forum', 'category'] });
      await queryClient.invalidateQueries({ queryKey: ['forum', 'categories'] });
    },
  });
}

/** Une image, envoyée telle quelle : l'API vérifie, ré-encode et rend son adresse. */
export function uploadForumImage(file: File): Promise<ForumImage> {
  const body = new FormData();
  body.append('image', file);
  return api<ForumImage>('/forum/images', { method: 'POST', body });
}

export const previewForumMarkdown = (content: string) =>
  api<ForumMarkdownPreview>('/forum/preview', send('POST', { content }));

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export const formatForumDate = (iso: string) => dateTime.format(new Date(iso));
