import { describe, expect, it } from 'vitest';
import { renderForumMarkdown } from './markdown.js';

const IMAGE = '/api/media/123e4567-e89b-12d3-a456-426614174000';

describe('renderForumMarkdown', () => {
  it('met en forme le Markdown, avec les retours à la ligne tels que tapés', () => {
    expect(renderForumMarkdown('**gras** et _italique_\nligne 2')).toBe(
      '<p><strong>gras</strong> et <em>italique</em><br>\nligne 2</p>\n',
    );
  });

  it('une balise HTML reste du texte', () => {
    const html = renderForumMarkdown('<img src=x onerror=alert(1)> <script>alert(1)</script>');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuse les liens javascript:, ouvre les autres dans un nouvel onglet', () => {
    expect(renderForumMarkdown('[clic](javascript:alert(1))')).not.toContain('href');
    expect(renderForumMarkdown('https://tracker.gg')).toContain(
      '<a href="https://tracker.gg" target="_blank" rel="nofollow noopener noreferrer">',
    );
  });

  it('affiche les images du forum, et seulement elles', () => {
    expect(renderForumMarkdown(`![build](${IMAGE})`)).toContain(
      `<img src="${IMAGE}" alt="build" loading="lazy">`,
    );
    expect(renderForumMarkdown('![pixel espion](https://evil.test/p.png)')).toContain(
      '[image : pixel espion]',
    );
    expect(renderForumMarkdown(`![x](${IMAGE}?suivi=1)`)).not.toContain('<img');
  });
});
