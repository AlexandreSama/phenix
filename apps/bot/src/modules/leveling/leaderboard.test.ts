import type { LeaderboardSlice } from '@phenix/database';
import { describe, expect, it } from 'vitest';
import { leaderboardLine, leaderboardView } from './leaderboard.js';

/** Espace fine insécable (U+202F) : fr-FR l'utilise pour séparer les milliers. */
const NNBSP = String.fromCharCode(0x20_2f);

const entry = (rank: number, displayName: string | null, xp: number) => ({
  guildId: '1',
  userId: `${rank}`,
  rank,
  displayName,
  avatarUrl: null,
  xp,
  level: 3,
  messages: 10,
  lastXpAt: null,
});

const slice = (page: number, pageCount: number): LeaderboardSlice => ({
  entries: [entry(1, 'Alpha', 1200)],
  page,
  pageCount,
  total: 1,
});

/** Les boutons tels qu'envoyés à Discord, réduits aux champs testés. */
type ButtonJson = { label?: string; disabled?: boolean; custom_id?: string; url?: string };
function buttons(view: ReturnType<typeof leaderboardView>): ButtonJson[] {
  return (view.components[0]?.toJSON().components ?? []) as ButtonJson[];
}

describe('leaderboardLine', () => {
  it('donne une médaille au podium et un numéro aux suivants', () => {
    expect(leaderboardLine(entry(1, 'Alpha', 1200))).toBe(`🥇 Alpha · niveau 3 · 1${NNBSP}200 XP`);
    expect(leaderboardLine(entry(4, 'Delta', 300))).toBe('**4.** Delta · niveau 3 · 300 XP');
  });

  it('neutralise le markdown d’un pseudo et nomme un membre inconnu', () => {
    expect(leaderboardLine(entry(5, '**Gros**', 10))).toContain('\\*\\*Gros\\*\\*');
    expect(leaderboardLine(entry(5, null, 10))).toContain('Membre parti');
  });
});

describe('leaderboardView', () => {
  it('désactive ◀ sur la première page et ▶ sur la dernière', () => {
    const [previous, current, next] = buttons(leaderboardView('Les Agents', slice(1, 1)));

    expect(previous?.disabled).toBe(true);
    expect(current?.label).toBe('Page 1 / 1');
    expect(next?.disabled).toBe(true);
  });

  it('pointe vers les pages voisines avec des customId uniques', () => {
    const ids = buttons(leaderboardView('Les Agents', slice(2, 3))).map(
      (button) => button.custom_id,
    );
    expect(ids).toEqual(['leaderboard:page:1', 'leaderboard:current', 'leaderboard:page:3']);
  });

  it('ajoute le lien vers le site seulement s’il est fourni', () => {
    expect(buttons(leaderboardView('A', slice(1, 1)))).toHaveLength(3);
    const withLink = buttons(leaderboardView('A', slice(1, 1), 'https://phenix.gg/classement/1'));
    expect(withLink.at(-1)).toMatchObject({ url: 'https://phenix.gg/classement/1' });
  });
});
