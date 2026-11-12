import { renderWelcomeTemplate, type WelcomeMessageKind } from '@phenix/shared';
import { escapeMarkdown, type EmbedBuilder } from 'discord.js';
import { baseEmbed, COLORS } from '../../core/embeds.js';

/** Le membre annoncé : ce qu'on affiche de lui, rien de plus. */
export interface AnnouncedMember {
  id: string;
  displayName: string;
  /** Avatar en PNG 256 px */
  avatarUrl: string;
}

export interface AnnouncedGuild {
  name: string;
  memberCount: number;
}

const ZWSP = '​';

/** Un texte venu d'ailleurs (pseudo, nom du serveur) s'affiche tel quel, sans mise en forme. */
function escapeValue(text: string): string {
  return escapeMarkdown(text, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
}

/** Casse `@everyone` et `<@&id>` dans un pseudo par une espace de largeur nulle. */
function neutralizeMentions(text: string): string {
  return text.replaceAll('@', `@${ZWSP}`).replaceAll('<', `<${ZWSP}`);
}

function announcementEmbed(
  member: AnnouncedMember,
  guild: AnnouncedGuild,
  template: string | null,
  kind: WelcomeMessageKind,
): EmbedBuilder {
  const description = renderWelcomeTemplate(
    template,
    {
      membre: `<@${member.id}>`,
      pseudo: neutralizeMentions(escapeValue(member.displayName)),
      serveur: escapeValue(guild.name),
      effectif: guild.memberCount,
    },
    kind,
  );
  return (
    baseEmbed(kind === 'welcome' ? COLORS.primary : COLORS.neutral)
      // Le nom de l'auteur d'un embed ne lit ni Markdown ni mention : pas d'échappement
      .setAuthor({ name: member.displayName, iconURL: member.avatarUrl })
      .setThumbnail(member.avatarUrl)
      .setDescription(description)
  );
}

/** Message d'arrivée : la mention notifie le membre, et lui seul, quel que soit le texte écrit. */
export function welcomePayload(
  member: AnnouncedMember,
  guild: AnnouncedGuild,
  template: string | null,
) {
  return {
    content: `<@${member.id}>`,
    embeds: [announcementEmbed(member, guild, template, 'welcome')],
    allowedMentions: { users: [member.id] },
  };
}

/** Message de départ : ne notifie personne. */
export function goodbyePayload(
  member: AnnouncedMember,
  guild: AnnouncedGuild,
  template: string | null,
) {
  return {
    embeds: [announcementEmbed(member, guild, template, 'goodbye')],
    allowedMentions: { parse: [] as [] },
  };
}
