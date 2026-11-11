import { FORUM_IMAGE_URL } from '@phenix/shared';
import MarkdownIt from 'markdown-it';

/**
 * Le Markdown du forum. `html: false` : une balise tapée dans un message s'affiche comme du
 * texte, jamais comme du HTML. markdown-it refuse déjà les liens javascript:, data:, vbscript:.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// Une image ne vient que du forum : une image externe permettrait de suivre les lecteurs
md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = String(token?.attrGet('src') ?? '');
  const alt = self.renderInlineAsText(token?.children ?? [], options, env);
  if (!FORUM_IMAGE_URL.test(src)) {
    return md.utils.escapeHtml(alt ? `[image : ${alt}]` : '[image]');
  }
  return `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}" loading="lazy">`;
};

// Un lien s'ouvre dans un nouvel onglet, sans transmettre l'adresse du forum ni lui donner de poids
md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  tokens[index]?.attrSet('target', '_blank');
  tokens[index]?.attrSet('rel', 'nofollow noopener noreferrer');
  return self.renderToken(tokens, index, options);
};

/** Le HTML d'un message. Sûr à insérer tel quel dans la page. */
export function renderForumMarkdown(markdown: string): string {
  return md.render(markdown);
}
