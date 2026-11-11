/** Les images du forum sont servies par l'API à cette adresse, suivie de leur identifiant. */
export const FORUM_MEDIA_PATH = '/api/media/';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Une adresse d'image du forum, et rien d'autre : pas de paramètre, pas de domaine. */
export const FORUM_IMAGE_URL = new RegExp(`^${FORUM_MEDIA_PATH}(${UUID})$`);

export const forumImageUrl = (id: string): string => `${FORUM_MEDIA_PATH}${id}`;

/** Les images citées dans un message, chacune une fois, dans l'ordre d'apparition. */
export function forumImageIds(markdown: string): string[] {
  const found = markdown.matchAll(new RegExp(`${FORUM_MEDIA_PATH}(${UUID})`, 'g'));
  return [...new Set([...found].map((match) => match[1] ?? ''))].filter(Boolean);
}
