import { z } from 'zod';
import {
  CASE_STATUS_LABELS,
  CASE_TYPE_LABELS,
  type CaseStatusKey,
  type CaseTypeKey,
} from '../constants.js';
import { snowflakeSchema } from './guild-config.js';

/** Taille d'une page de sanctions : fixée par le serveur, jamais par le client. */
export const CASE_PAGE_SIZE = 20;

const CASE_TYPES = Object.keys(CASE_TYPE_LABELS) as [CaseTypeKey, ...CaseTypeKey[]];
const CASE_STATUSES = Object.keys(CASE_STATUS_LABELS) as [CaseStatusKey, ...CaseStatusKey[]];

/** `AAAA-MM-JJ` d'un vrai jour du calendrier, lu en UTC (début ou fin de journée). */
function day(endOfDay: boolean) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
    .transform((value, ctx) => {
      const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        ctx.addIssue({ code: 'custom', message: 'Date invalide' });
        return z.NEVER;
      }
      return date;
    });
}

/** ?page=&type=&status=&moderatorId=&targetId=&q=&from=&to= de la liste des sanctions. */
export const caseListQuerySchema = z
  .object({
    page: z.coerce
      .number({ error: 'Numéro de page invalide' })
      .int('Numéro de page invalide')
      .min(1, 'Numéro de page invalide')
      .max(1000, 'Numéro de page invalide')
      .default(1),
    type: z.enum(CASE_TYPES).optional(),
    status: z.enum(CASE_STATUSES).optional(),
    moderatorId: snowflakeSchema.optional(),
    targetId: snowflakeSchema.optional(),
    q: z
      .string()
      .trim()
      .max(100, '100 caractères au plus')
      .transform((value) => value || undefined)
      .optional(),
    from: day(false).optional(),
    to: day(true).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: 'La période est à l’envers',
    path: ['to'],
  });

export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

/** Une personne telle que le site l'affiche : repli sur l'identifiant si Discord ne répond pas. */
export interface ResolvedUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Une sanction dans la liste. `status` est null pour une expulsion, une fin de sourdine… */
export interface CaseSummary {
  number: number;
  type: CaseTypeKey;
  status: CaseStatusKey | null;
  target: ResolvedUser;
  moderator: ResolvedUser;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: ResolvedUser | null;
}

export interface CasePage {
  items: CaseSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** L'en-tête de la fiche d'un membre ; son historique est la liste filtrée par `targetId`. */
export interface MemberModeration {
  user: ResolvedUser;
  total: number;
  byType: Record<CaseTypeKey, number>;
  activeWarns: number;
  activeMute: { number: number; expiresAt: string | null } | null;
  activeBan: { number: number } | null;
}
