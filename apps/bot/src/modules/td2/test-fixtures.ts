import type { Td2EventDetails, Td2Role, Td2ReportDetails } from '@phenix/database';

// Données de test partagées par les tests du module TD2 (pas de vi.mock ici)

export const GUILD = '100000000000000001';
export const CHANNEL = '400000000000000001';
export const ORGANIZER = '200000000000000001';

let order = 0;

/** Une inscription ; l'ordre de création suit l'ordre d'appel, comme la réserve. */
export function signup(
  userId: string,
  role: Td2Role,
  status: 'CONFIRMED' | 'RESERVE' = 'CONFIRMED',
): Td2EventDetails['signups'][number] {
  order += 1;
  return {
    eventId: 12,
    userId,
    role,
    status,
    createdAt: new Date(Date.UTC(2026, 10, 9, 10, order)),
  };
}

const RAID_SLOTS = [
  { eventId: 12, role: 'DPS', count: 6 },
  { eventId: 12, role: 'HEAL', count: 1 },
  { eventId: 12, role: 'TANK', count: 1 },
] as const;

/** Un raid Dark Hours en mode Normal, samedi 14 novembre à 21 h (heure de Paris). */
export function raidEvent(overrides: Partial<Td2EventDetails> = {}): Td2EventDetails {
  return {
    id: 12,
    guildId: GUILD,
    modeId: 3,
    scheduledAt: new Date('2026-11-14T20:00:00Z'),
    channelId: CHANNEL,
    messageId: '900000000000000001',
    organizerId: ORGANIZER,
    cancelledAt: null,
    createdAt: new Date('2026-11-09T12:00:00Z'),
    mode: {
      id: 3,
      activityId: 1,
      name: 'Normal',
      activity: { id: 1, kind: 'RAID', name: 'Dark Hours', active: true },
    },
    slots: RAID_SLOTS.map((slot) => ({ ...slot })),
    signups: [],
    ...overrides,
  };
}

/** Une incursion Paradis Perdu : un seul mode, 3 DPS et 1 Heal/Tank. */
export function incursionEvent(overrides: Partial<Td2EventDetails> = {}): Td2EventDetails {
  return raidEvent({
    mode: {
      id: 9,
      activityId: 3,
      name: 'Standard',
      activity: { id: 3, kind: 'INCURSION', name: 'Paradis Perdu', active: true },
    },
    slots: [
      { eventId: 12, role: 'DPS', count: 3 },
      { eventId: 12, role: 'HEAL_TANK', count: 1 },
    ],
    ...overrides,
  });
}

export const REPORTER = '500000000000000001';

/** Un signalement « non vérifié » fait sur GUILD, avec une capture. */
export function td2Report(overrides: Partial<Td2ReportDetails> = {}): Td2ReportDetails {
  return {
    id: 7,
    guildId: GUILD,
    guild: { name: 'Phenix' },
    reporterId: REPORTER,
    playerName: 'Agent47',
    playerNameLower: 'agent47',
    platform: 'PSN',
    reason: 'CHEAT',
    details: 'Tir à travers les murs',
    evidenceKeys: ['td2-reports/1/a.png'],
    status: 'PENDING',
    reviewedById: null,
    reviewedAt: null,
    staffMessageId: '900000000000000007',
    createdAt: new Date('2026-11-10T12:00:00Z'),
    ...overrides,
  };
}