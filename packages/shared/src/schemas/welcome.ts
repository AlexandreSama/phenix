import { z } from 'zod';
import { snowflakeSchema } from './guild-config.js';

/**
 * Variables des messages d'arrivée et de départ, écrites entre accolades : `{membre}`.
 * Ce sont des mots affichés aux personnes qui rédigent le message, donc en français.
 */
export const WELCOME_VARIABLES = ['membre', 'pseudo', 'serveur', 'effectif'] as const;

export type WelcomeVariable = (typeof WELCOME_VARIABLES)[number];

/** Un message d'arrivée ou de départ, tel que l'écrit l'administrateur. */
export const WELCOME_LIMITS = { messageMax: 1000 } as const;

/**
 * Longueur maximale de la description d'un embed, en unités UTF-16 : discord.js compte
 * `.length` (un émoji en vaut deux) et refuse l'embed au-delà.
 */
const RENDERED_MAX = 4096;

/** Textes envoyés quand le serveur n'a pas écrit le sien (null en base). */
export const WELCOME_DEFAULTS = {
  welcomeMessage: 'Bienvenue {membre} sur **{serveur}** ! Nous sommes maintenant {effectif}.',
  goodbyeMessage: '**{pseudo}** a quitté **{serveur}**. Nous sommes maintenant {effectif}.',
} as const;

const ALLOWED_LIST = WELCOME_VARIABLES.map((name) => `{${name}}`).join(', ');
const TOKEN = /\{([^{}]+)\}/g;
/**
 * Simple aide à la saisie : le vrai garde-fou est `allowedMentions` à l'envoi,
 * qui ne laisse passer que la mention du membre.
 */
const MASS_MENTION = /@everyone|@here|<@&\d+>/;

/** Un message d'arrivée ou de départ ; vide = texte par défaut (null). */
export const welcomeTemplateSchema = z
  .string()
  .trim()
  .max(WELCOME_LIMITS.messageMax, `${WELCOME_LIMITS.messageMax} caractères au plus`)
  .superRefine((text, ctx) => {
    for (const [token, name] of text.matchAll(TOKEN)) {
      if (!(WELCOME_VARIABLES as readonly string[]).includes(name ?? '')) {
        ctx.addIssue({
          code: 'custom',
          message: `Variable inconnue : ${token}. Variables permises : ${ALLOWED_LIST}`,
        });
      }
    }
    if (MASS_MENTION.test(text)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pas de mention @everyone, @here ni de rôle dans ce message',
      });
    }
  })
  .transform((text) => text || null)
  .nullable();

/**
 * Réglages des messages d'arrivée et de départ d'un serveur, et du rôle donné à l'arrivée.
 * Les champs seuls : le site les adapte à son formulaire, puis y remet la règle ci-dessous.
 */
export const welcomeSettingsFields = z.object({
  welcomeEnabled: z.boolean(),
  welcomeChannelId: snowflakeSchema.nullable(),
  welcomeMessage: welcomeTemplateSchema,
  /** Rôle donné une fois la vérification Discord passée ; vide = aucun */
  welcomeRoleId: snowflakeSchema.nullable(),
  goodbyeEnabled: z.boolean(),
  goodbyeChannelId: snowflakeSchema.nullable(),
  goodbyeMessage: welcomeTemplateSchema,
});

/** Un message activé part dans un salon : sans salon, rien à envoyer. */
export function welcomeChannelRule<
  T extends z.ZodType<{
    welcomeEnabled: boolean;
    welcomeChannelId: string | null;
    goodbyeEnabled: boolean;
    goodbyeChannelId: string | null;
  }>,
>(schema: T): T {
  return schema.superRefine((settings, ctx) => {
    if (settings.welcomeEnabled && settings.welcomeChannelId === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choisis le salon des messages d’arrivée',
        path: ['welcomeChannelId'],
      });
    }
    if (settings.goodbyeEnabled && settings.goodbyeChannelId === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choisis le salon des messages de départ',
        path: ['goodbyeChannelId'],
      });
    }
  });
}

export const welcomeSettingsSchema = welcomeChannelRule(welcomeSettingsFields);

export type WelcomeSettings = z.infer<typeof welcomeSettingsSchema>;

/** Valeurs des variables ; `effectif` est mis au format français au rendu. */
export interface WelcomeTemplateValues {
  membre: string;
  pseudo: string;
  serveur: string;
  effectif: number;
}

export type WelcomeMessageKind = 'welcome' | 'goodbye';

const VARIABLE = new RegExp(`\\{(${WELCOME_VARIABLES.join('|')})\\}`, 'g');

/**
 * Remplit un message en un seul passage : une valeur qui contient `{serveur}` ou `$&`
 * reste telle quelle. Sans message (null), prend le texte par défaut. Coupé après rendu à
 * 4096 unités UTF-16, la limite de discord.js, sans couper un émoji en deux. N'échappe
 * rien : c'est au bot de le faire.
 */
export function renderWelcomeTemplate(
  template: string | null,
  values: WelcomeTemplateValues,
  kind: WelcomeMessageKind,
): string {
  const text =
    template ??
    (kind === 'welcome' ? WELCOME_DEFAULTS.welcomeMessage : WELCOME_DEFAULTS.goodbyeMessage);
  const rendered = text.replace(VARIABLE, (_, name: WelcomeVariable) =>
    name === 'effectif' ? values.effectif.toLocaleString('fr-FR') : values[name],
  );
  if (rendered.length <= RENDERED_MAX) return rendered;
  const cut = rendered.slice(0, RENDERED_MAX);
  // Dernière unité = première moitié d'une paire de substitution (émoji coupé) : on la retire
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
