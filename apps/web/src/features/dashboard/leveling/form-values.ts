import {
  levelingConfigFields,
  totalXpForLevel,
  withXpRange,
  type LevelingConfig,
} from '@phenix/shared';
import { z } from 'zod';

/** Dans un <select>, « Salon du message » vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) => (value === '' ? null : value);

/** Le schéma partagé, adapté au formulaire. La règle min ≤ max est la même que celle de l'API. */
export const levelingFormSchema = withXpRange(
  levelingConfigFields.extend({
    levelUpChannelId: z.preprocess(emptyToNull, levelingConfigFields.shape.levelUpChannelId),
  }),
);

export type LevelingFormInput = z.input<typeof levelingFormSchema>;

export function toFormValues(config: LevelingConfig): LevelingFormInput {
  return { ...config, levelUpChannelId: config.levelUpChannelId ?? '' };
}

export interface LevelEstimate {
  messages: number;
  /** Durée minimale de discussion, en minutes, à cause du délai entre deux gains */
  minutes: number;
}

/** Ce qu'il faut à un membre actif pour atteindre un niveau, avec un gain moyen. */
export function estimateLevel(
  level: number,
  xpMin: number,
  xpMax: number,
  cooldownSec: number,
): LevelEstimate | null {
  if (!Number.isFinite(xpMin) || !Number.isFinite(xpMax) || xpMin < 1 || xpMax < xpMin) return null;
  const messages = Math.ceil(totalXpForLevel(level) / ((xpMin + xpMax) / 2));
  return { messages, minutes: Math.ceil((messages * Math.max(cooldownSec, 0)) / 60) };
}

/** « 3 h 54 min », « 45 min », « moins d'une minute ». */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return "moins d'une minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
