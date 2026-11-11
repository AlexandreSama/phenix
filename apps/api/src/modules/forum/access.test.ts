import { describe, expect, it } from 'vitest';
import {
  canDeletePost,
  canEditAny,
  canEditPost,
  canModerate,
  canReply,
  type ForumViewer,
} from './access.js';

const viewer = (role: ForumViewer['role'], isOwner = false): ForumViewer => ({
  id: 'moi',
  role,
  isOwner,
});

describe('les droits sur le forum', () => {
  it('modèrent : modérateurs, administrateurs, propriétaires du bot', () => {
    expect(canModerate(null)).toBe(false);
    expect(canModerate(viewer('MEMBER'))).toBe(false);
    expect(canModerate(viewer('MODERATOR'))).toBe(true);
    expect(canModerate(viewer('MEMBER', true))).toBe(true);
  });

  it('corrigent le message d’un autre : administrateurs et propriétaires seulement', () => {
    expect(canEditAny(viewer('MODERATOR'))).toBe(false);
    expect(canEditAny(viewer('ADMIN'))).toBe(true);
    expect(canEditPost(viewer('MEMBER'), 'moi')).toBe(true);
    expect(canEditPost(viewer('MODERATOR'), 'autre')).toBe(false);
  });

  it('le premier message ne se supprime jamais seul', () => {
    expect(canDeletePost(viewer('MEMBER'), 'moi', false)).toBe(true);
    expect(canDeletePost(viewer('MEMBER'), 'moi', true)).toBe(false);
    expect(canDeletePost(viewer('MODERATOR'), 'autre', false)).toBe(true);
    expect(canDeletePost(viewer('MEMBER'), 'autre', false)).toBe(false);
  });

  it('un sujet verrouillé ne reçoit plus que les réponses de la modération', () => {
    expect(canReply(null, false)).toBe(false);
    expect(canReply(viewer('MEMBER'), true)).toBe(false);
    expect(canReply(viewer('MODERATOR'), true)).toBe(true);
  });
});
