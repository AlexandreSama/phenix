import { TD2_DIFFICULTY_LABELS, TD2_EVENT_KIND_LABELS, type Td2EventSummary } from '@phenix/shared';
import type { IconName } from '../components/icon';

type Named = Pick<Td2EventSummary, 'kind' | 'activity' | 'mode' | 'difficulty'>;

/** L'icône de chaque type de sortie, sur le site comme dans les listes. */
export const EVENT_KIND_ICONS: Record<Td2EventSummary['kind'], IconName> = {
  RAID: 'crosshair',
  INCURSION: 'shield',
  MISSION: 'flag',
};

/** Ce qui précise la sortie : le mode d'un raid, la difficulté d'une mission. */
export function eventDetail(event: Named): string | null {
  if (event.kind === 'RAID') return event.mode;
  if (event.kind === 'MISSION' && event.difficulty) return TD2_DIFFICULTY_LABELS[event.difficulty];
  return null;
}

/**
 * « Raid Dark Hours · Normal », « Incursion Paradis Perdu », « Mission Capitole · Héroïque » :
 * comme sur Discord. Une incursion n'a qu'un mode, inutile de le répéter.
 */
export function eventName(event: Named): string {
  const detail = eventDetail(event);
  return `${TD2_EVENT_KIND_LABELS[event.kind]} ${event.activity}${detail ? ` · ${detail}` : ''}`;
}

/** Le remplissage en pourcentage, borné à 100 : la réserve ne fait pas déborder la barre. */
export function fillPercent(event: Pick<Td2EventSummary, 'confirmed' | 'capacity'>): number {
  if (event.capacity <= 0) return 0;
  return Math.round((Math.min(event.confirmed, event.capacity) / event.capacity) * 100);
}
