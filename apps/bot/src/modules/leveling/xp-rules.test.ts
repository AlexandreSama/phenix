import { describe, expect, it } from 'vitest';
import { isXpExcluded } from './xp-rules.js';

const channel = '300000000000000001';
const category = '400000000000000001';
const parent = '500000000000000001';

describe('isXpExcluded', () => {
  it('n’exclut rien quand la liste est vide', () => {
    expect(isXpExcluded([], { channelId: channel, categoryId: category })).toBe(false);
  });

  it('exclut un salon qui figure dans la liste', () => {
    expect(isXpExcluded([channel], { channelId: channel })).toBe(true);
  });

  it('exclut un salon dont la catégorie figure dans la liste', () => {
    expect(isXpExcluded([category], { channelId: channel, categoryId: category })).toBe(true);
  });

  it('exclut un fil dont le salon parent figure dans la liste', () => {
    expect(isXpExcluded([parent], { channelId: channel, parentChannelId: parent })).toBe(true);
  });

  it('exclut un fil dont la catégorie du salon parent figure dans la liste', () => {
    expect(
      isXpExcluded([category], {
        channelId: channel,
        parentChannelId: parent,
        categoryId: category,
      }),
    ).toBe(true);
  });

  it('exclut la discussion d’un salon vocal par son propre identifiant', () => {
    const voice = '600000000000000001';
    expect(isXpExcluded([voice], { channelId: voice, categoryId: category })).toBe(true);
  });

  it('n’exclut pas un salon absent d’une liste non vide', () => {
    expect(
      isXpExcluded([parent, category], {
        channelId: channel,
        parentChannelId: null,
        categoryId: null,
      }),
    ).toBe(false);
  });

  it('distingue des identifiants proches mais différents', () => {
    expect(
      isXpExcluded(['300000000000000002', '40000000000000000', '4000000000000000011'], {
        channelId: channel,
        categoryId: category,
      }),
    ).toBe(false);
  });
});
