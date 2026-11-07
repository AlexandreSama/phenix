/**
 * Les customId suivent le format `module:action:id` (ex. `giveaway:join:42`).
 * Le préfixe `module:action` désigne le handler, l'id l'objet concerné.
 */
export function buildCustomId(module: string, action: string, id?: string | number): string {
  return id === undefined ? `${module}:${action}` : `${module}:${action}:${id}`;
}

export function parseCustomId(customId: string): { prefix: string; id: string | undefined } {
  const [module = '', action = '', ...rest] = customId.split(':');
  return { prefix: `${module}:${action}`, id: rest.length > 0 ? rest.join(':') : undefined };
}
