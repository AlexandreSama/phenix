/** Jeton d'injection des variables d'environnement validées. */
export const ENV = Symbol('ENV');

/** Jeton d'injection du bucket des transcripts (Garage). */
export const TRANSCRIPTS = Symbol('TRANSCRIPTS');

/** Jeton d'injection de la file BullMQ des giveaways. */
export const GIVEAWAY_QUEUE = Symbol('GIVEAWAY_QUEUE');

/** Jeton d'injection du planificateur des giveaways (publications, tirages). */
export const GIVEAWAYS = Symbol('GIVEAWAYS');

/** Jeton d'injection du bucket des preuves des signalements TD2 (Garage). */
export const EVIDENCE = Symbol('EVIDENCE');

/** Jeton d'injection du bucket des images du forum (Garage). */
export const MEDIA = Symbol('MEDIA');
