import { findTd2Report, reviewTd2Report, type Td2ReportStatus } from '@phenix/database';
import { TD2_REPORT_STATUS_LABELS } from '@phenix/shared';
import { MessageFlags } from 'discord.js';
import type { ComponentHandler } from '../../../core/command.js';
import { canReviewReports } from './access.js';
import { broadcastTd2Report } from './feed.js';
import { reportStaffMessage } from './messages.js';

export const REVIEW_REPLIES = {
    forbidden:
        "Seuls l'équipe du serveur et les membres qui gèrent le serveur examinent les signalements.",
    missing: "Ce signalement n'existe plus : il a été supprimé par l'administration du bot.",
    noEvidence: 'Sans capture, un signalement ne peut pas être confirmé.',
    final:
        "Ce signalement est confirmé et déjà partagé : seule l'administration du bot peut le retirer.",
    unchanged: (status: Td2ReportStatus) =>
        `Déjà fait : ce signalement est « ${TD2_REPORT_STATUS_LABELS[status]} ».`,
    reviewed: (id: number, status: Td2ReportStatus) =>
        `Signalement #${id} : ${TD2_REPORT_STATUS_LABELS[status].toLowerCase()}.`,
    shared: (count: number) =>
        count === 0
            ? ' Aucun serveur du réseau n’a de fil des signalements pour le moment.'
            : ` Annoncé dans le fil de ${count} serveur${count > 1 ? 's' : ''}.`,
} as const;

const ephemeral = (content: string) => ({ content, flags: MessageFlags.Ephemeral }) as const;

/** Les trois boutons sous un signalement partagent la même logique ; seul le statut visé change. */
function reviewButton(
    action: 'review' | 'confirm' | 'reject',
    status: Td2ReportStatus,
): ComponentHandler {
    return {
        prefix: `td2report:${action}`,
        async execute(interaction, id, { db, configs, logger }) {
            if (!interaction.isButton() || !interaction.inCachedGuild()) return;
            const reportId = Number(id);
            if (!Number.isSafeInteger(reportId)) return;

            const settings = await configs.get(interaction.guildId);
            if (!canReviewReports(interaction.member, settings)) {
                await interaction.reply(ephemeral(REVIEW_REPLIES.forbidden));
                return;
            }

            const result = await reviewTd2Report(db, {
                id: reportId,
                guildId: interaction.guildId,
                status,
                reviewerId: interaction.user.id,
            });
            switch (result.status) {
                case 'missing':
                    // Supprimé depuis le site : on retire les boutons pour que personne ne recommence
                    await interaction.update({ components: [] });
                    await interaction.followUp(ephemeral(REVIEW_REPLIES.missing));
                    return;
                case 'no-evidence':
                    await interaction.reply(ephemeral(REVIEW_REPLIES.noEvidence));
                    return;
                case 'final':
                    await interaction.reply(ephemeral(REVIEW_REPLIES.final));
                    return;
                case 'unchanged': {
                    // Quelqu'un est passé avant : le message rattrape l'état de la base
                    const current = await findTd2Report(db, reportId);
                    await (current
                        ? interaction.update(reportStaffMessage(current))
                        : interaction.deferUpdate());
                    await interaction.followUp(ephemeral(REVIEW_REPLIES.unchanged(result.current)));
                    return;
                }
                case 'reviewed':
                    break;
            }

            await interaction.update(reportStaffMessage(result.report));
            let reply = REVIEW_REPLIES.reviewed(reportId, status);
            if (status === 'CONFIRMED') {
                const count = await broadcastTd2Report(interaction.client, db, result.report, logger);
                reply += REVIEW_REPLIES.shared(count);
            }
            logger.info(
                { guildId: interaction.guildId, reportId, status, reviewerId: interaction.user.id },
                'Signalement TD2 examiné',
            );
            await interaction.followUp(ephemeral(reply));
        },
    };
}

export const reviewReportButton = reviewButton('review', 'IN_REVIEW');
export const confirmReportButton = reviewButton('confirm', 'CONFIRMED');
export const rejectReportButton = reviewButton('reject', 'REJECTED');