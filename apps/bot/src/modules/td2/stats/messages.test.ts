import { describe, expect, it } from 'vitest';
import { careerMessage, formatDuration, formatStat } from './messages.js';
import type { Td2Career } from './provider.js';

// Intl sépare les milliers par une espace fine insécable, comme le veut le français
const NNBSP = String.fromCodePoint(0x202f);

const career: Td2Career = {
  platform: 'PSN',
  handle: 'Agent47',
  avatarUrl: 'https://avatar.test/agent47.png',
  profileUrl: 'https://tracker.test/profile/agent47',
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
  it('l’en-tête plateforme, le pseudo en titre cliquable, l’avatar et le crédit', () => {
    const embed = careerMessage(career, 'Powered by Tracker Network').embeds[0]?.toJSON();

    expect(embed?.author?.name).toBe('PLAYSTATION · PROFIL D’AGENT');
    expect(embed?.title).toBe('Agent47');
    expect(embed?.url).toBe('https://tracker.test/profile/agent47');
    expect(embed?.thumbnail?.url).toBe('https://avatar.test/agent47.png');
    expect(embed?.footer?.text).toBe('Powered by Tracker Network');
  });

  it('sans adresse de profil, le titre n’est pas un lien', () => {
    const embed = careerMessage({ ...career, profileUrl: null }, '').embeds[0]?.toJSON();

    expect(embed?.title).toBe('Agent47');
    expect(embed?.url).toBeUndefined();
  });

  it('le niveau et le score en titre ###, la spécialisation dessous', () => {
    const embed = careerMessage(career, '').embeds[0]?.toJSON();

    expect(embed?.description).toBe(
      '### Niveau 40 · Score d’équipement 515\n🧬 Spécialisation : **Firewall**',
    );
  });

  it('le temps de jeu en pleine largeur, une durée par ligne', () => {
    const fields = careerMessage(
      {
        ...career,
        stats: {
          timePlayed: { kind: 'duration', seconds: 1_234_567 },
          timePve: { kind: 'duration', seconds: 3600 },
          timeDarkZone: { kind: 'duration', seconds: 120 },
        },
      },
      '',
    ).embeds[0]?.toJSON().fields;

    expect(fields).toEqual([
      {
        name: '⏱️ Temps de jeu',
        value: '**342 h 56 min** au total\n**1 h 0 min** en PvE\n**2 min** en Dark Zone',
        inline: false,
      },
    ]);
  });

  it('PvE et Dark Zone côte à côte, le chiffre avant le libellé', () => {
    const fields = careerMessage(career, '').embeds[0]?.toJSON().fields?.slice(1);

    expect(fields?.map((field) => field.name)).toEqual(['🎯 PvE', '☠️ Dark Zone']);
    expect(fields?.map((field) => field.inline)).toEqual([true, true]);
    expect(fields?.[0]?.value).toBe(`**48${NNBSP}213** ennemis éliminés`);
    expect(fields?.[1]?.value).toBe('Rang **87**');
  });

  it('les autres lignes, dans l’ordre d’avant', () => {
    const fields = careerMessage(
      {
        ...career,
        stats: {
          npcKills: { kind: 'number', value: 1 },
          eliteKills: { kind: 'number', value: 2 },
          namedKills: { kind: 'number', value: 3 },
          headshots: { kind: 'number', value: 4 },
          dzRank: { kind: 'number', value: 5 },
          roguesKilled: { kind: 'number', value: 6 },
          pvpKills: { kind: 'number', value: 7 },
        },
      },
      '',
    ).embeds[0]?.toJSON().fields;

    expect(fields?.[0]?.value).toBe(
      '**1** ennemis éliminés\n**2** élites\n**3** nommés\n**4** tirs à la tête',
    );
    expect(fields?.[1]?.value).toBe('Rang **5**\n**6** renégats éliminés\n**7** agents éliminés');
  });

  it('un champ absent : ni ligne vide, ni « undefined »', () => {
    const embed = careerMessage(
      { ...career, avatarUrl: null, stats: { gearScore: { kind: 'number', value: 515 } } },
      '',
    ).embeds[0]?.toJSON();

    expect(embed?.description).toBe('### Score d’équipement 515');
    expect(embed?.fields ?? []).toEqual([]);
    expect(embed?.thumbnail).toBeUndefined();
    expect(JSON.stringify(embed)).not.toContain('undefined');
  });

  it('aucune stat : le dit, sans bloc vide', () => {
    const embed = careerMessage({ ...career, stats: {} }, '').embeds[0]?.toJSON();

    expect(embed?.fields ?? []).toEqual([]);
    expect(embed?.description).toBe('Aucune statistique publique pour cet agent.');
  });
});
