import { describe, expect, it } from 'vitest';
import { careerMessage, formatDuration, formatStat } from './messages.js';
import type { Td2Career } from './provider.js';

// Intl sépare les milliers par une espace fine insécable, comme le veut le français
const NNBSP = String.fromCodePoint(0x202f);

const career: Td2Career = {
  platform: 'PSN',
  handle: 'Agent47',
  avatarUrl: 'https://avatar.test/agent47.png',
  stats: {
    level: { kind: 'number', value: 40 },
    gearScore: { kind: 'number', value: 515 },
    specialization: { kind: 'text', value: 'Firewall' },
    timePlayed: { kind: 'duration', seconds: 1_234_567 },
    npcKills: { kind: 'number', value: 48_213 },
    dzRank: { kind: 'number', value: 87 },
  },
};

describe('mise en forme', () => {
  it('les durées en heures et minutes, les nombres à la française', () => {
    expect(formatDuration(1_234_567)).toBe('342 h 56 min');
    expect(formatDuration(2520)).toBe('42 min');
    expect(formatDuration(4_000_000)).toBe(`1${NNBSP}111 h 6 min`);
    expect(formatStat({ kind: 'number', value: 48_213 })).toBe(`48${NNBSP}213`);
    expect(formatStat({ kind: 'text', value: 'Firewall' })).toBe('Firewall');
  });
});

describe('careerMessage', () => {
  it('le pseudo et la plateforme, l’avatar, et le crédit du service', () => {
    const embed = careerMessage(career, 'Powered by Tracker Network').embeds[0]?.toJSON();

    expect(embed?.title).toBe('Agent47 · PlayStation');
    expect(embed?.thumbnail?.url).toBe('https://avatar.test/agent47.png');
    expect(embed?.footer?.text).toBe('Powered by Tracker Network');
  });

  it('un bloc par thème, sans les lignes ni les blocs vides', () => {
    const fields = careerMessage(career, '').embeds[0]?.toJSON().fields;

    expect(fields?.map((field) => field.name)).toEqual([
      'Niveau',
      'Temps de jeu',
      'PvE',
      'Dark Zone',
    ]);
    expect(fields?.[0]?.value).toBe(
      'Niveau : **40**\nScore d’équipement : **515**\nSpécialisation : **Firewall**',
    );
    expect(fields?.[1]?.value).toBe('Total : **342 h 56 min**');
    expect(fields?.[2]?.value).toBe(`Ennemis éliminés : **48${NNBSP}213**`);
  });

  it('aucune stat : le dit, sans bloc vide', () => {
    const embed = careerMessage({ ...career, stats: {} }, '').embeds[0]?.toJSON();

    expect(embed?.fields ?? []).toEqual([]);
    expect(embed?.description).toBe('Aucune statistique publique pour cet agent.');
  });
});
