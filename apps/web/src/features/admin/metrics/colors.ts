/**
 * Les couleurs des courbes, dans cet ordre et jamais recyclées. Validées sur la surface des
 * panneaux (#26170f) : écart suffisant pour les daltonismes, contraste ≥ 3:1. Le texte, lui,
 * reste dans les couleurs du texte.
 */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];

/** Le bot en bleu, l'API en orange, sur toutes les courbes de la page. */
export const SERVICE_COLORS = { bot: SERIES_COLORS[0]!, api: SERIES_COLORS[1]! };

/** Les barres (une seule série) : l'or de la marque. */
export const BAR_COLOR = 'var(--color-gold)';
