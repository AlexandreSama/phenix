import { findRolePanel } from '@phenix/database';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import { panelRoleRefusal } from './role-check.js';

const STALE = "Ce bouton n'est plus à jour : le panel a changé ou a été supprimé.";
const DENIED =
  'Discord a refusé le changement : vérifie que mon rôle est placé au-dessus de celui-ci.';

/** Réponse visible du seul membre, sans notifier personne. */
function answer(interaction: ButtonInteraction, content: string) {
  return interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

/**
 * Un clic sur un bouton de panel : donne le rôle, ou le retire si le membre l'a déjà.
 * En mode « un seul rôle », prendre un rôle retire les autres rôles du même panel.
 */
export const rolePanelButton: ComponentHandler = {
  prefix: 'rolepanel:toggle',
  async execute(interaction, id, { db, logger }) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;

    const [panelId = '', roleId = ''] = (id ?? '').split('.');
    const panel = await findRolePanel(db, Number(panelId));
    if (
      !panel ||
      panel.guildId !== interaction.guildId ||
      !panel.options.some((option) => option.roleId === roleId)
    ) {
      await answer(interaction, STALE);
      return;
    }

    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
      await answer(interaction, "Ce rôle n'existe plus. Préviens un admin du serveur.");
      return;
    }
    const refusal = panelRoleRefusal(role);
    if (refusal) {
      await answer(interaction, refusal);
      return;
    }

    const member = interaction.member;
    const reason = `Panel de rôles « ${panel.title} »`;
    try {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, reason);
        await answer(interaction, `Rôle ${role} retiré.`);
        return;
      }

      const replaced =
        panel.mode === 'UNIQUE'
          ? panel.options
              .map((option) => option.roleId)
              .filter((other) => other !== role.id && member.roles.cache.has(other))
          : [];
      // On donne d'abord : si Discord refuse, le membre ne perd rien
      await member.roles.add(role, reason);
      if (replaced.length > 0) await member.roles.remove(replaced, reason);

      const swap = replaced.map((other) => `<@&${other}>`).join(', ');
      await answer(
        interaction,
        swap ? `Rôle ${role} ajouté, à la place de ${swap}.` : `Rôle ${role} ajouté.`,
      );
    } catch (err) {
      logger.warn(
        { err, guildId: interaction.guildId, roleId },
        'Rôle du panel refusé par Discord',
      );
      await answer(interaction, DENIED);
    }
  },
};
