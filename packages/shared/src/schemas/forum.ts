import { z } from 'zod';
import { FORUM_LIMITS, FORUM_ROLE_LABELS, type ForumRoleKey } from '../constants.js';

const content = z
  .string()
  .trim()
  .min(1, 'Écris quelque chose')
  .max(FORUM_LIMITS.contentMax, `${FORUM_LIMITS.contentMax} caractères au plus`);

/** Une réponse, ou la modification d'un message : du Markdown, jamais de HTML. */
export const forumPostInputSchema = z.object({ content });

/** Un nouveau sujet : sa catégorie, son titre, et son premier message. */
export const forumThreadInputSchema = z.object({
  categoryId: z.number().int().positive(),
  title: z
    .string()
    .trim()
    .min(3, 'Un titre de 3 caractères au moins')
    .max(FORUM_LIMITS.titleMax, `${FORUM_LIMITS.titleMax} caractères au plus`),
  content,
});

/** Épingler ou verrouiller un sujet : au moins l'un des deux. */
export const forumThreadModerationSchema = z
  .object({ pinned: z.boolean().optional(), locked: z.boolean().optional() })
  .refine((patch) => patch.pinned !== undefined || patch.locked !== undefined, 'Rien à modifier');

/** ?page=2 dans l'URL ; absente ou illisible, c'est la première. */
export const forumPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/** Une catégorie, gérée par les propriétaires du bot. Le slug fait l'adresse : /forum/annonces. */
export const forumCategoryInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(40, '40 caractères au plus')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets : « the-division-2 »'),
  name: z.string().trim().min(1, 'Donne un nom').max(60, '60 caractères au plus'),
  description: z
    .string()
    .trim()
    .max(200, '200 caractères au plus')
    .nullable()
    .transform((value) => value || null),
  position: z.number().int().min(0).max(1000),
});

const ROLES = Object.keys(FORUM_ROLE_LABELS) as [ForumRoleKey, ...ForumRoleKey[]];

export const forumRoleInputSchema = z.object({ role: z.enum(ROLES) });

/** La recherche d'un membre du site, pour lui donner un rôle. */
export const forumUserQuerySchema = z.object({
  q: z.string().trim().min(2, 'Deux lettres au moins').max(32),
});

export type ForumPostInput = z.infer<typeof forumPostInputSchema>;
export type ForumThreadInput = z.infer<typeof forumThreadInputSchema>;
export type ForumThreadModeration = z.infer<typeof forumThreadModerationSchema>;
export type ForumPageQuery = z.infer<typeof forumPageQuerySchema>;
export type ForumCategoryInput = z.input<typeof forumCategoryInputSchema>;
export type ForumCategoryData = z.output<typeof forumCategoryInputSchema>;
export type ForumRoleInput = z.infer<typeof forumRoleInputSchema>;
export type ForumUserQuery = z.infer<typeof forumUserQuerySchema>;
