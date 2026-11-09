import { giveawayEndProblem, giveawayInputSchema } from '@phenix/shared';
import { z } from 'zod';

/** « Tout le monde » vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/**
 * Le champ datetime-local donne une heure locale sans fuseau (« 2026-11-10T20:00 ») ;
 * l'API attend une date ISO complète. Une saisie illisible reste telle quelle et échoue au schéma.
 */
export function localToIso(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** L'inverse, pour pré-remplir le champ : l'heure locale à la minute. */
export function toLocalInput(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Le schéma partagé adapté au formulaire, plus la règle sur la date de fin :
 * mêmes messages que l'API et que /giveaway sur Discord.
 */
export const giveawayFormSchema = (now: () => Date) =>
  giveawayInputSchema
    .extend({
      endsAt: z.preprocess(localToIso, giveawayInputSchema.shape.endsAt),
      requiredRoleId: z.preprocess(emptyToNull, giveawayInputSchema.shape.requiredRoleId),
    })
    .superRefine((input, ctx) => {
      const problem = giveawayEndProblem(new Date(input.endsAt), now());
      if (problem) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: problem });
    });

export type GiveawayFormInput = z.input<ReturnType<typeof giveawayFormSchema>>;

/** Un giveaway de 24 h, à l'heure pile suivante : il reste à choisir le salon et le lot. */
export function defaultGiveawayValues(now: Date): GiveawayFormInput {
  const end = new Date(now.getTime() + 86_400_000);
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);
  return {
    channelId: '',
    prize: '',
    winnersCount: 1,
    endsAt: toLocalInput(end),
    requiredRoleId: '',
  };
}
