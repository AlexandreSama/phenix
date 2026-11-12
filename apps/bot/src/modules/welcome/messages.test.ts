import { WELCOME_DEFAULTS } from '@phenix/shared';
import { describe, expect, it } from 'vitest';
import { COLORS } from '../../core/embeds.js';
import { goodbyePayload, welcomePayload, type AnnouncedMember } from './messages.js';

const ZWSP = '​';
const MEMBER_ID = '200000000000000001';
const AVATAR = 'https://cdn.discordapp.com/avatars/200000000000000001/abc.png?size=256';

const person = (displayName = 'Agent Phénix'): AnnouncedMember => ({
  id: MEMBER_ID,
  displayName,
  avatarUrl: AVATAR,
});
const guild = { name: 'Les Agents', memberCount: 12_345 };

describe('welcomePayload', () => {
  it('notifie le membre, et lui seul, avec l’embed de bienvenue', () => {
    const payload = welcomePayload(person(), guild, null);

    expect(payload.content).toBe(`<@${MEMBER_ID}>`);
    expect(payload.allowedMentions).toEqual({ users: [MEMBER_ID] });
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.color).toBe(Number.parseInt(COLORS.primary.slice(1), 16));
    expect(embed.author).toEqual({ name: 'Agent Phénix', icon_url: AVATAR });
    expect(embed.thumbnail).toEqual({ url: AVATAR });
    expect(embed.description).toBe(
      WELCOME_DEFAULTS.welcomeMessage
        .replace('{membre}', `<@${MEMBER_ID}>`)
        .replace('{serveur}', 'Les Agents')
        .replace('{effectif}', (12_345).toLocaleString('fr-FR')),
    );
  });

  it('ne notifie personne d’autre même si le message écrit contient @everyone ou un rôle', () => {
    const payload = welcomePayload(
      person(),
      guild,
      '@everyone @here <@&300000000000000001> {membre}',
    );

    expect(payload.content).toBe(`<@${MEMBER_ID}>`);
    expect(payload.allowedMentions).toEqual({ users: [MEMBER_ID] });
  });

  it('échappe le Markdown du pseudo et neutralise ses mentions', () => {
    const pseudo = '# **gras** [lien](https://evil.example) @everyone <@&1>';

    const description = welcomePayload(person(pseudo), guild, '{pseudo}').embeds[0]!.toJSON()
      .description!;

    expect(description).not.toContain('**gras**');
    expect(description).toContain('\\*\\*gras\\*\\*');
    expect(description.startsWith('\\#')).toBe(true);
    expect(description).not.toMatch(/(?<!\\)\[lien\]\(/);
    expect(description).not.toContain('@everyone');
    expect(description).toContain(`@${ZWSP}everyone`);
    expect(description).toContain(`<${ZWSP}@${ZWSP}&1>`);
  });

  it('échappe les listes dans le pseudo', () => {
    const bulleted = welcomePayload(person('- puce'), guild, '{pseudo}').embeds[0]!.toJSON();
    const numbered = welcomePayload(person('1. un'), guild, '{pseudo}').embeds[0]!.toJSON();

    expect(bulleted.description).toBe('\\- puce');
    expect(numbered.description).toBe('1\\. un');
  });

  it('échappe le Markdown du nom du serveur', () => {
    const payload = welcomePayload(person(), { ...guild, name: '__Agents__' }, '{serveur}');

    expect(payload.embeds[0]!.toJSON().description).toBe('\\_\\_Agents\\_\\_');
  });

  it('garde la mention {membre} intacte', () => {
    const payload = welcomePayload(person(), guild, 'Salut {membre}');

    expect(payload.embeds[0]!.toJSON().description).toBe(`Salut <@${MEMBER_ID}>`);
  });
});

describe('goodbyePayload', () => {
  it('n’a pas de contenu et ne notifie personne', () => {
    const payload = goodbyePayload(person(), guild, '@everyone {membre} {pseudo}');

    expect(payload).not.toHaveProperty('content');
    expect(payload.allowedMentions).toEqual({ parse: [] });
  });

  it('rend le message de départ par défaut, aux couleurs neutres', () => {
    const embed = goodbyePayload(person('**Agent**'), guild, null).embeds[0]!.toJSON();

    expect(embed.color).toBe(Number.parseInt(COLORS.neutral.slice(1), 16));
    expect(embed.author).toEqual({ name: '**Agent**', icon_url: AVATAR });
    expect(embed.thumbnail).toEqual({ url: AVATAR });
    expect(embed.description).toBe(
      WELCOME_DEFAULTS.goodbyeMessage
        .replace('{pseudo}', '\\*\\*Agent\\*\\*')
        .replace('{serveur}', 'Les Agents')
        .replace('{effectif}', (12_345).toLocaleString('fr-FR')),
    );
  });
});
