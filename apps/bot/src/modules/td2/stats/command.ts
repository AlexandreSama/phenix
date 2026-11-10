import { findTd2Profile, linkTd2Profile, unlinkTd2Profile } from '@phenix/database';
import { TD2_PLATFORM_LABELS, type Td2PlatformKey } from '@phenix/shared';
import {
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { BotContext } from '../../../core/context.js';
import { refuse } from '../../moderation/common.js';
import { playerOptions, readPlayer } from '../player-options.js';
import { careerMessage } from './messages.js';
import type { Td2StatsUnavailable } from './provider.js';

const label = (platform: Td2PlatformKey) => TD2_PLATFORM_LABELS[platform];

export const STATS_REPLIES = {
  linked: (handle: string, platform: Td2PlatformKey) =>
    `Compte lié : **${handle}** (${label(platform)}). \`/td2 stats\` sans argument affichera ses stats.`,
  unverified: '\nLe pseudo n’a pas pu être vérifié pour l’instant : assure-toi qu’il est exact.',
  notFound: (name: string, platform: Td2PlatformKey) =>
    `Aucun agent « ${name} » sur ${label(platform)}. Vérifie le pseudo et la plateforme.`,
  unlinked: 'Compte délié.',
  noLink: 'Tu n’as pas de compte lié.',
  needPlatform: 'Précise la plateforme du joueur.',
  needPlayer: 'Précise la plateforme et le pseudo, ou lie ton compte avec `/td2 lier`.',
  memberNotLinked: (userId: string) => `<@${userId}> n’a pas lié de compte The Division 2.`,
  unavailable: {
    'no-key': 'Les stats ne sont pas encore branchées sur ce bot.',
    refused: 'Le service de stats refuse les demandes du bot pour l’instant. Réessaie plus tard.',
    'rate-limited': 'Trop de demandes de stats en ce moment. Réessaie dans une minute.',
    down: 'Le service de stats ne répond pas. Réessaie dans quelques minutes.',
  } satisfies Record<Td2StatsUnavailable, string>,
} as const;

/** /td2 lier : plateforme et pseudo, vérifiés auprès du service de stats. */
export const linkSubcommand = (sub: SlashCommandSubcommandBuilder) =>
  playerOptions({ required: true, platform: 'Ta plateforme' })(
    sub.setName('lier').setDescription('Lie ton compte The Division 2 : /td2 stats le retrouvera'),
  );

export const unlinkSubcommand = (sub: SlashCommandSubcommandBuilder) =>
  sub.setName('délier').setDescription('Retire ton compte The Division 2 lié');

/** /td2 stats : ton compte, celui d'un membre, ou n'importe quel joueur. */
export const statsSubcommand = (sub: SlashCommandSubcommandBuilder) =>
  playerOptions({ required: false, platform: 'La plateforme du joueur' })(
    sub.setName('stats').setDescription('La carrière d’un agent : niveau, temps de jeu, PvE, DZ'),
  ).addUserOption((option) =>
    option.setName('membre').setDescription('Un membre qui a lié son compte'),
  );

export async function linkAccount(
  interaction: ChatInputCommandInteraction,
  { db, stats, logger }: BotContext,
): Promise<void> {
  const { platform, playerName } = readPlayer(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await stats.career(platform, playerName);
  if (result.status === 'not-found') {
    await interaction.editReply(STATS_REPLIES.notFound(playerName, platform));
    return;
  }
  // Le service ne répond pas : la liaison ne dépend pas de lui, on garde le pseudo tel que tapé
  const verified = result.status === 'ok';
  const handle = verified ? result.career.handle : playerName;
  if (!verified) logger.warn({ reason: result.reason }, 'Compte TD2 lié sans vérification');

  await linkTd2Profile(db, { userId: interaction.user.id, platform, playerName: handle });
  await interaction.editReply(
    STATS_REPLIES.linked(handle, platform) + (verified ? '' : STATS_REPLIES.unverified),
  );
}

export async function unlinkAccount(
  interaction: ChatInputCommandInteraction,
  { db }: BotContext,
): Promise<void> {
  const removed = await unlinkTd2Profile(db, interaction.user.id);
  await interaction.reply({
    content: removed ? STATS_REPLIES.unlinked : STATS_REPLIES.noLink,
    flags: MessageFlags.Ephemeral,
  });
}

type Target = { platform: Td2PlatformKey; playerName: string } | { refusal: string };

/** Qui afficher : le pseudo tapé, sinon le compte du membre choisi, sinon le sien. */
async function resolveTarget(
  interaction: ChatInputCommandInteraction,
  { db }: BotContext,
): Promise<Target> {
  const platform = interaction.options.getString('plateforme') as Td2PlatformKey | null;
  const playerName = interaction.options.getString('pseudo')?.trim();
  if (playerName) {
    return platform ? { platform, playerName } : { refusal: STATS_REPLIES.needPlatform };
  }

  const member = interaction.options.getUser('membre');
  const userId = member?.id ?? interaction.user.id;
  const profile = await findTd2Profile(db, userId);
  if (profile) return { platform: profile.platform, playerName: profile.playerName };
  return {
    refusal:
      userId === interaction.user.id
        ? STATS_REPLIES.needPlayer
        : STATS_REPLIES.memberNotLinked(userId),
  };
}

export async function showStats(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  const { stats, logger } = context;
  if (!stats.enabled) return refuse(interaction, STATS_REPLIES.unavailable['no-key']);
  const target = await resolveTarget(interaction, context);
  if ('refusal' in target) return refuse(interaction, target.refusal);

  // Le service peut mettre quelques secondes : Discord en accorde 3 avant la première réponse
  await interaction.deferReply();
  const result = await stats.career(target.platform, target.playerName);
  switch (result.status) {
    case 'ok':
      await interaction.editReply(careerMessage(result.career, stats.credit));
      return;
    case 'not-found':
      await interaction.editReply(STATS_REPLIES.notFound(target.playerName, target.platform));
      return;
    case 'unavailable':
      logger.warn({ reason: result.reason }, 'Stats TD2 indisponibles');
      await interaction.editReply(STATS_REPLIES.unavailable[result.reason]);
      return;
    default: {
      const unhandled: never = result;
      return unhandled;
    }
  }
}

/** Les pseudos proposés pendant la frappe, sur la plateforme déjà choisie. */
export async function autocompletePlayer(
  interaction: AutocompleteInteraction,
  { stats }: BotContext,
  typed: string,
): Promise<void> {
  const platform = interaction.options.getString('plateforme') as Td2PlatformKey | null;
  const query = typed.trim();
  if (!platform || query.length < 2) {
    await interaction.respond([]);
    return;
  }
  const names = await stats.search(platform, query);
  await interaction.respond(names.slice(0, 25).map((name) => ({ name, value: name })));
}
