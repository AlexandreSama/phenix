import { findTd2Event, joinTd2Event, leaveTd2Event, type Td2Role } from '@phenix/database';
import { TD2_ROLE_LABELS } from '@phenix/shared';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import { isTd2Role, promotionMessage, reservePosition, td2EventMessage } from './messages.js';
import { sendTd2Notice } from './sync.js';

const label = (role: Td2Role) => TD2_ROLE_LABELS[role];
const rank = (position: number) => (position === 1 ? '1ʳᵉ' : `${position}ᵉ`);

export const SIGNUP_REPLIES = {
  missing: "Cette sortie n'existe plus.",
  closed: 'Les inscriptions sont fermées : la sortie a commencé ou a été annulée.',
  noSlot: "Ce rôle n'existe pas pour cette sortie.",
  joined: (role: Td2Role) => `C'est noté : tu joues ${label(role)}.`,
  reserve: (role: Td2Role, position: number) =>
    `${label(role)} est complet : tu es en réserve (${rank(position)}). ` +
    'Tu passeras dans l’équipe dès qu’une place se libère.',
  switched: (from: Td2Role, role: Td2Role) => `Tu passes de ${label(from)} à ${label(role)}.`,
  already: (role: Td2Role) =>
    `Tu es déjà inscrit en ${label(role)}. « Se désinscrire » pour libérer ta place.`,
  alreadyReserve: (role: Td2Role, position: number) =>
    `Tu es déjà en réserve en ${label(role)} (${rank(position)}).`,
  left: 'Tu es désinscrit.',
  notSigned: "Tu n'es pas inscrit à cette sortie.",
} as const;

const ephemeral = (content: string) => ({ content, flags: MessageFlags.Ephemeral }) as const;

/** Le message de la sortie, relu en base, remplace celui qui porte le bouton. */
async function refreshFromClick(interaction: ButtonInteraction, db: BotContext['db'], id: number) {
  const event = await findTd2Event(db, id);
  if (event) await interaction.update(td2EventMessage(event));
  return event;
}

/**
 * Bouton de rôle (« DPS 3/6 »). Le clic met à jour le message lui-même (interaction.update) :
 * pas d'appel de plus à Discord, et chacun voit les places bouger tout de suite.
 */
export const joinTd2Button: ComponentHandler = {
  prefix: 'td2:join',
  async execute(interaction, id, { db, logger }) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [rawId, role] = (id ?? '').split(':');
    const eventId = Number(rawId);
    if (!Number.isSafeInteger(eventId) || !isTd2Role(role)) return;

    const result = await joinTd2Event(db, eventId, interaction.user.id, role);
    switch (result.status) {
      case 'missing':
        await interaction.reply(ephemeral(SIGNUP_REPLIES.missing));
        return;
      case 'closed':
        await interaction.reply(ephemeral(SIGNUP_REPLIES.closed));
        return;
      case 'no-slot':
        await interaction.reply(ephemeral(SIGNUP_REPLIES.noSlot));
        return;
      case 'already': {
        const event = await findTd2Event(db, eventId);
        const position = event ? reservePosition(event, interaction.user.id) : 0;
        await interaction.reply(
          ephemeral(
            result.signupStatus === 'RESERVE'
              ? SIGNUP_REPLIES.alreadyReserve(role, position)
              : SIGNUP_REPLIES.already(role),
          ),
        );
        return;
      }
      case 'joined':
        break;
    }

    const event = await refreshFromClick(interaction, db, eventId);
    if (!event) return;
    const position = reservePosition(event, interaction.user.id);
    const lines = [
      result.previousRole ? SIGNUP_REPLIES.switched(result.previousRole, role) : '',
      result.signupStatus === 'RESERVE'
        ? SIGNUP_REPLIES.reserve(role, position)
        : SIGNUP_REPLIES.joined(role),
    ].filter(Boolean);
    await interaction.followUp(ephemeral(lines.join('\n')));

    // Changer de rôle a pu libérer une place : celui qui monte est prévenu
    if (result.promoted.length > 0) {
      await sendTd2Notice(
        interaction.client,
        event,
        promotionMessage(event, result.promoted),
      ).catch((err: unknown) => logger.warn({ err, eventId }, 'Montée de la réserve non annoncée'));
    }
  },
};

/** « Se désinscrire » : la place confirmée passe au premier de la réserve du même rôle. */
export const leaveTd2Button: ComponentHandler = {
  prefix: 'td2:leave',
  async execute(interaction, id, { db, logger }) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const eventId = Number(id);
    if (!Number.isSafeInteger(eventId)) return;

    const result = await leaveTd2Event(db, eventId, interaction.user.id);
    if (result.status !== 'left') {
      const content = {
        missing: SIGNUP_REPLIES.missing,
        closed: SIGNUP_REPLIES.closed,
        'not-signed': SIGNUP_REPLIES.notSigned,
      }[result.status];
      await interaction.reply(ephemeral(content));
      return;
    }

    const event = await refreshFromClick(interaction, db, eventId);
    if (!event) return;
    await interaction.followUp(ephemeral(SIGNUP_REPLIES.left));
    if (result.promoted.length > 0) {
      await sendTd2Notice(
        interaction.client,
        event,
        promotionMessage(event, result.promoted),
      ).catch((err: unknown) => logger.warn({ err, eventId }, 'Montée de la réserve non annoncée'));
    }
  },
};
