import { describe, expect, it } from 'vitest';
import { progressBar, rankEmbed } from './rank-card.js';

describe('progressBar', () => {
  it('remplit la barre selon l’avancement, sans déborder', () => {
    expect(progressBar(0, 4)).toBe('▱▱▱▱');
    expect(progressBar(0.5, 4)).toBe('▰▰▱▱');
    expect(progressBar(1.4, 4)).toBe('▰▰▰▰');
  });
});

describe('rankEmbed', () => {
  it('montre le niveau, la place et l’XP restante', () => {
    const embed = rankEmbed({
      rank: { xp: 355, messages: 18, rank: 2, total: 40 },
      displayName: 'Agent',
      avatarUrl: 'https://cdn/avatar.png',
    }).toJSON();

    expect(embed.fields?.map((field) => field.value)).toEqual([
      '**2**',
      '**#2** sur 40',
      '355',
      '▰▰▰▰▰▱▱▱▱▱▱▱  100 / 220 XP',
    ]);
    expect(embed.fields?.[3]?.name).toBe('Vers le niveau 3');
  });
});
