import type { ForumRoleKey } from '@phenix/shared';

/** La personne qui regarde le forum : son rôle, et si elle fait partie des propriétaires du bot. */
export interface ForumViewer {
  id: string;
  role: ForumRoleKey;
  isOwner: boolean;
}

/** Épingler, verrouiller, supprimer : modérateurs, administrateurs et propriétaires du bot. */
export const canModerate = (viewer: ForumViewer | null): boolean =>
  viewer !== null && (viewer.isOwner || viewer.role !== 'MEMBER');

/** Corriger le message de n'importe qui : administrateurs et propriétaires seulement. */
export const canEditAny = (viewer: ForumViewer | null): boolean =>
  viewer !== null && (viewer.isOwner || viewer.role === 'ADMIN');

export const canEditPost = (viewer: ForumViewer | null, authorId: string): boolean =>
  viewer !== null && (viewer.id === authorId || canEditAny(viewer));

/** Le premier message ne se supprime pas seul : il emporte le sujet, ce qui relève de la modération. */
export const canDeletePost = (
  viewer: ForumViewer | null,
  authorId: string,
  isFirst: boolean,
): boolean => viewer !== null && !isFirst && (viewer.id === authorId || canModerate(viewer));

/** Répondre : être connecté, et que le sujet soit ouvert, sauf pour la modération. */
export const canReply = (viewer: ForumViewer | null, locked: boolean): boolean =>
  viewer !== null && (!locked || canModerate(viewer));
