import {
  cancelTd2Event,
  findTd2Event,
  listTd2Directives,
  rescheduleTd2Event,
  setTd2EventDirectives,
  type Td2EventDetails,
} from '@phenix/database';
import { EVENT_DATE_EXAMPLES, parseEventDate } from '@phenix/shared';
import {
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputStyle,
  time,
  TimestampStyles,
  type Client,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import {
  cancelNotice,
  confirmCancelMenu,
  dateModalCustomId,
  KEEP_CUSTOM_ID,
  manageMenu,
  rescheduleNotice,
} from './messages.js';
import { sendTd2Notice, syncTd2Message } from './sync.js';

export const MANAGE_REPLIES = {
  missing: "Cette sortie n'existe plus.",
  forbidden: "Seul l'organisateur, l'équipe du serveur ou un admin peut gérer cette sortie.",
  closed: 'Cette sortie a déjà commencé ou a été annulée.',
  kept: "Rien n'a changé.",
  cancelled: 'Sortie annulée. Les inscrits sont prévenus.',
  rescheduled: (date: Date) =>
    `Sortie déplacée au ${time(date, TimestampStyles.LongDateTime)}. Les inscrits sont prévenus.`,
  directives: (names: string[]) =>
    names.length > 0
      ? `Directives enregistrées : ${names.join(' · ')}.`
      : 'Plus aucune directive sur cette mission.',
  notMission: 'Seule une mission a des directives.',
} as const;

const DEFAULT_TIMEZONE = 'Europe/Paris';
const ephemeral = (content: string) => ({ content, flags: MessageFlags.Ephemeral }) as const;

/** Ce que canManage lit d'un membre ; un GuildMember convient, un faux de test aussi. */
interface MemberLike {
  id: string;
  permissions: { has(flag: bigint): boolean };
  roles: { cache: { has(roleId: string): boolean } };
}

/** L'organisateur, un admin du serveur (Gérer le serveur) ou un rôle d'équipe choisi sur le site. */
export function canManage(
  member: MemberLike,
  event: Pick<Td2EventDetails, 'organizerId'>,
  staffRoleIds: readonly string[],
): boolean {
  return (
    event.organizerId === member.id ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    staffRoleIds.some((roleId) => member.roles.cache.has(roleId))
  );
}

const isClosed = (event: Td2EventDetails, now = new Date()) =>
  event.cancelledAt !== null || event.scheduledAt.getTime() <= now.getTime();

/**
 * Lit la sortie et vérifie que ce membre peut la gérer maintenant.
 * Répond lui-même au refus ; renvoie la sortie, ou null après un refus.
 */
async function loadManageable(
  interaction: Parameters<ComponentHandler['execute']>[0],
  id: string | undefined,
  { db, configs }: BotContext,
): Promise<Td2EventDetails | null> {
  if (!interaction.inCachedGuild()) return null;
  const eventId = Number(id);
  const event = Number.isSafeInteger(eventId) ? await findTd2Event(db, eventId) : null;
  if (!event || event.guildId !== interaction.guildId) {
    await interaction.reply(ephemeral(MANAGE_REPLIES.missing));
    return null;
  }
  const settings = await configs.get(interaction.guildId);
  if (!canManage(interaction.member, event, settings?.staffRoleIds ?? [])) {
    await interaction.reply(ephemeral(MANAGE_REPLIES.forbidden));
    return null;
  }
  if (isClosed(event)) {
    await interaction.reply(ephemeral(MANAGE_REPLIES.closed));
    return null;
  }
  return event;
}

/** Remplace le menu éphémère par un message de fin, ou répond si ce n'est pas possible. */
async function finish(
  interaction: ModalSubmitInteraction | Parameters<ComponentHandler['execute']>[0],
  content: string,
) {
  if (interaction.isButton() || (interaction.isModalSubmit() && interaction.isFromMessage())) {
    await interaction.update({ content, components: [] });
  } else {
    await interaction.reply(ephemeral(content));
  }
}

/**
 * Met le message de la sortie à jour. La base et les tâches ont déjà changé : un salon
 * supprimé ou Discord en panne ne doit pas faire échouer le formulaire, on le note seulement.
 */
async function refreshMessage(
  interaction: { client: Client },
  { db, logger }: BotContext,
  event: Td2EventDetails,
) {
  await syncTd2Message(interaction.client, db, event).catch((err: unknown) =>
    logger.warn({ err, eventId: event.id }, 'Message de la sortie non mis à jour'),
  );
}

/** « ⚙️ Gérer », sous le message de la sortie : un menu visible du seul organisateur. */
export const manageTd2Button: ComponentHandler = {
  prefix: 'td2:manage',
  async execute(interaction, id, context) {
    if (!interaction.isButton()) return;
    const event = await loadManageable(interaction, id, context);
    if (!event) return;
    // Une mission propose aussi ses directives : la liste du moment, celles retenues cochées
    const directives = event.mode ? [] : await listTd2Directives(context.db, { activeOnly: true });
    await interaction.reply({ ...manageMenu(event, directives), flags: MessageFlags.Ephemeral });
  },
};

/**
 * Le menu des directives d'une mission (après /td2 mission, ou dans « Gérer ») : la sélection
 * remplace les directives de la sortie, puis son message est mis à jour.
 */
export const directivesTd2Select: ComponentHandler = {
  prefix: 'td2:directives',
  async execute(interaction, id, context) {
    if (!interaction.isStringSelectMenu()) return;
    const event = await loadManageable(interaction, id, context);
    if (!event) return;

    const ids = interaction.values.map(Number).filter(Number.isSafeInteger);
    const updated = await setTd2EventDirectives(context.db, event.id, ids);
    if (updated === null || updated === 'closed' || updated === 'not-mission') {
      const reply = {
        null: MANAGE_REPLIES.missing,
        closed: MANAGE_REPLIES.closed,
        'not-mission': MANAGE_REPLIES.notMission,
      }[updated ?? 'null'];
      await interaction.reply(ephemeral(reply));
      return;
    }
    await refreshMessage(interaction, context, updated);
    await interaction.update({
      content: MANAGE_REPLIES.directives(updated.directives),
      components: [],
    });
  },
};

/** « Changer la date » : un formulaire d'un champ, la date en texte libre. */
export const rescheduleTd2Button: ComponentHandler = {
  prefix: 'td2:reschedule',
  async execute(interaction, id, context) {
    if (!interaction.isButton()) return;
    const event = await loadManageable(interaction, id, context);
    if (!event) return;
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(dateModalCustomId(event.id))
        .setTitle('Changer la date')
        .addLabelComponents((label) =>
          label
            .setLabel('Nouvelle date')
            .setDescription(`Par exemple ${EVENT_DATE_EXAMPLES}`)
            .setTextInputComponent((input) =>
              input
                .setCustomId('date')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(60),
            ),
        ),
    );
  },
};

/** Le formulaire de date validé : la sortie, son message, ses tâches et les inscrits suivent. */
export const rescheduleTd2Modal: ComponentHandler = {
  prefix: 'td2:date',
  async execute(interaction, id, context) {
    if (!interaction.isModalSubmit() || !interaction.inCachedGuild()) return;
    const event = await loadManageable(interaction, id, context);
    if (!event) return;

    const settings = await context.configs.get(interaction.guildId);
    const parsed = parseEventDate(interaction.fields.getTextInputValue('date'), {
      now: new Date(),
      timeZone: settings?.timezone ?? DEFAULT_TIMEZONE,
    });
    if (!parsed.ok) {
      await interaction.reply(ephemeral(parsed.error));
      return;
    }

    const updated = await rescheduleTd2Event(context.db, event.id, parsed.date);
    if (updated === null || updated === 'closed') {
      await interaction.reply(
        ephemeral(updated === null ? MANAGE_REPLIES.missing : MANAGE_REPLIES.closed),
      );
      return;
    }
    // L'ancien rappel et l'ancienne fermeture sont retirés, les nouveaux planifiés
    await context.td2.schedule(updated.id, updated.scheduledAt);
    await refreshMessage(interaction, context, updated);
    if (updated.signups.length > 0) {
      await sendTd2Notice(interaction.client, updated, rescheduleNotice(updated)).catch(
        (err: unknown) =>
          context.logger.warn({ err, eventId: updated.id }, 'Nouvelle date non annoncée'),
      );
    }
    await finish(interaction, MANAGE_REPLIES.rescheduled(updated.scheduledAt));
  },
};

/** « Annuler la sortie » : on demande confirmation dans le même menu. */
export const cancelTd2Button: ComponentHandler = {
  prefix: 'td2:cancel',
  async execute(interaction, id, context) {
    if (!interaction.isButton()) return;
    const event = await loadManageable(interaction, id, context);
    if (event) await interaction.update(confirmCancelMenu(event));
  },
};

export const confirmCancelTd2Button: ComponentHandler = {
  prefix: 'td2:confirmcancel',
  async execute(interaction, id, context) {
    if (!interaction.isButton()) return;
    const event = await loadManageable(interaction, id, context);
    if (!event) return;

    const cancelled = await cancelTd2Event(context.db, event.id);
    if (cancelled === null || cancelled === 'closed') {
      await finish(
        interaction,
        cancelled === null ? MANAGE_REPLIES.missing : MANAGE_REPLIES.closed,
      );
      return;
    }
    await context.td2.cancel(cancelled.id);
    await refreshMessage(interaction, context, cancelled);
    if (cancelled.signups.length > 0) {
      await sendTd2Notice(interaction.client, cancelled, cancelNotice(cancelled)).catch(
        (err: unknown) =>
          context.logger.warn({ err, eventId: cancelled.id }, 'Annulation non annoncée'),
      );
    }
    await finish(interaction, MANAGE_REPLIES.cancelled);
  },
};

export const keepTd2Button: ComponentHandler = {
  prefix: KEEP_CUSTOM_ID,
  async execute(interaction) {
    if (!interaction.isButton()) return;
    await interaction.update({ content: MANAGE_REPLIES.kept, components: [] });
  },
};
