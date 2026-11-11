import { describe, expect, it } from 'vitest';
import {
  forumCategoryInputSchema,
  forumPageQuerySchema,
  forumThreadInputSchema,
  forumThreadModerationSchema,
} from './forum.js';

const message = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('sujets et messages', () => {
  it('rogne le titre et le message, refuse le vide et le trop long', () => {
    expect(
      forumThreadInputSchema.parse({ categoryId: 1, title: '  Build tank  ', content: ' Salut ' }),
    ).toEqual({ categoryId: 1, title: 'Build tank', content: 'Salut' });
    expect(
      message(forumThreadInputSchema.safeParse({ categoryId: 1, title: 'ok', content: 'x' })),
    ).toBe('Un titre de 3 caractères au moins');
    expect(
      message(
        forumThreadInputSchema.safeParse({
          categoryId: 1,
          title: 'Un titre',
          content: 'x'.repeat(10_001),
        }),
      ),
    ).toBe('10000 caractères au plus');
    expect(
      message(forumThreadInputSchema.safeParse({ categoryId: 1, title: 'Titre', content: '   ' })),
    ).toBe('Écris quelque chose');
  });

  it('modérer change au moins quelque chose', () => {
    expect(forumThreadModerationSchema.parse({ locked: true })).toEqual({ locked: true });
    expect(message(forumThreadModerationSchema.safeParse({}))).toBe('Rien à modifier');
  });

  it('une page illisible dans l’URL devient la première', () => {
    expect(forumPageQuerySchema.parse({ page: '3' })).toEqual({ page: 3 });
    expect(forumPageQuerySchema.parse({ page: 'abc' })).toEqual({ page: 1 });
    expect(forumPageQuerySchema.parse({})).toEqual({ page: 1 });
  });
});

describe('catégories', () => {
  it('un slug en minuscules et tirets, une description vide devient null', () => {
    expect(
      forumCategoryInputSchema.parse({
        slug: ' The-Division-2 ',
        name: 'The Division 2',
        description: '  ',
        position: 0,
      }),
    ).toEqual({ slug: 'the-division-2', name: 'The Division 2', description: null, position: 0 });
    expect(
      message(
        forumCategoryInputSchema.safeParse({
          slug: 'aide ici',
          name: 'Aide',
          description: null,
          position: 1,
        }),
      ),
    ).toBe('Minuscules, chiffres et tirets : « the-division-2 »');
  });
});
