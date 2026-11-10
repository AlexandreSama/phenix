import type { PrismaClient, Td2Platform, Td2ReportStatus } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'td2Report'>;

/** Les pseudos TD2 ne tiennent pas compte de la casse : on compare sans espaces autour, en minuscules. */
export const normalizePlayerName = (name: string): string => name.trim().toLowerCase();

export interface NewTd2Report {
    guildId: string;
    reporterId: string;
    playerName: string;
    platform: Td2Platform;
    reason: string;
    details: string | null;
    evidenceKeys: string[];
}

/** Enregistre un signalement, « non vérifié » tant que le staff d'origine ne l'a pas examiné. */
export function createTd2Report(db: Db, input: NewTd2Report) {
    const playerName = input.playerName.trim();
    return db.td2Report.create({
        data: { ...input, playerName, playerNameLower: normalizePlayerName(playerName) },
    });
}

export async function markTd2ReportPosted(
    db: Db,
    id: number,
    staffMessageId: string,
): Promise<void> {
    await db.td2Report.update({ where: { id }, data: { staffMessageId } });
}

/** Un signalement avec le nom de son serveur d'origine. */
export function findTd2Report(db: Db, id: number) {
    return db.td2Report.findUnique({ where: { id }, include: { guild: { select: { name: true } } } });
}

export type Td2ReportDetails = NonNullable<Awaited<ReturnType<typeof findTd2Report>>>;

export type Td2ReviewResult =
    | { status: 'missing' }
    | { status: 'unchanged'; current: Td2ReportStatus }
    | { status: 'no-evidence' }
    /** Confirmé = déjà partagé avec le réseau : seuls les propriétaires du bot peuvent encore le retirer */
    | { status: 'final' }
    | { status: 'reviewed'; report: Td2ReportDetails; previous: Td2ReportStatus };

export interface Td2Review {
    id: number;
    /** Le serveur où le bouton a été cliqué : seul le staff d'origine examine */
    guildId: string;
    status: Td2ReportStatus;
    reviewerId: string;
    now?: Date;
}

/**
 * Change le statut d'un signalement. Confirmer exige au moins une preuve, et un signalement
 * confirmé ne change plus : il est déjà parti dans le fil des autres serveurs.
 * La mise à jour est conditionnée au statut lu : si deux membres du staff cliquent en même
 * temps, le second voit « déjà fait » au lieu d'écraser le premier.
 */
export async function reviewTd2Report(
    db: Db,
    { id, guildId, status, reviewerId, now = new Date() }: Td2Review,
): Promise<Td2ReviewResult> {
    const report = await db.td2Report.findUnique({ where: { id } });
    if (!report || report.guildId !== guildId) return { status: 'missing' };
    if (report.status === status) return { status: 'unchanged', current: report.status };
    if (report.status === 'CONFIRMED') return { status: 'final' };
    if (status === 'CONFIRMED' && report.evidenceKeys.length === 0) return { status: 'no-evidence' };

    const { count } = await db.td2Report.updateMany({
        where: { id, status: report.status },
        data: { status, reviewedById: reviewerId, reviewedAt: now },
    });
    const updated = await findTd2Report(db, id);
    if (!updated) return { status: 'missing' };
    if (count === 0) return { status: 'unchanged', current: updated.status };
    return { status: 'reviewed', report: updated, previous: report.status };
}

/** Combien de signalements un membre a faits depuis une date : de quoi freiner le spam. */
export function countRecentTd2Reports(
    db: Db,
    { guildId, reporterId, since }: { guildId: string; reporterId: string; since: Date },
): Promise<number> {
    return db.td2Report.count({ where: { guildId, reporterId, createdAt: { gte: since } } });
}

/** Un signalement tel qu'un autre serveur du réseau a le droit de le voir. */
export interface Td2PlayerReport {
    id: number;
    guildName: string;
    /** Vrai pour un signalement fait sur le serveur qui consulte */
    own: boolean;
    /** L'auteur, pour le seul staff du serveur d'origine */
    reporterId: string | null;
    reason: string;
    /** Les détails, pour le serveur d'origine et une fois confirmé */
    details: string | null;
    status: Td2ReportStatus;
    evidenceCount: number;
    createdAt: Date;
}

/**
 * Les signalements d'un joueur, vus depuis un serveur. Ceux du serveur lui-même : tous.
 * Ceux des autres serveurs : jamais les rejetés, jamais l'auteur.
 */
export async function listPlayerReports(
    db: Db,
    {
        platform,
        playerName,
        viewerGuildId,
        limit = 10,
    }: { platform: Td2Platform; playerName: string; viewerGuildId: string; limit?: number },
): Promise<Td2PlayerReport[]> {
    const reports = await db.td2Report.findMany({
        where: {
            platform,
            playerNameLower: normalizePlayerName(playerName),
            OR: [{ guildId: viewerGuildId }, { status: { not: 'REJECTED' } }],
        },
        include: { guild: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
    return reports.map((report) => {
        const own = report.guildId === viewerGuildId;
        return {
            id: report.id,
            guildName: report.guild.name,
            own,
            reporterId: own ? report.reporterId : null,
            reason: report.reason,
            details: own || report.status === 'CONFIRMED' ? report.details : null,
            status: report.status,
            evidenceCount: report.evidenceKeys.length,
            createdAt: report.createdAt,
        };
    });
}

/** Les salons du fil des signalements confirmés, sur les serveurs où le bot est encore. */
export async function listTd2FeedChannels(
    db: Pick<PrismaClient, 'guildConfig'>,
): Promise<{ guildId: string; channelId: string }[]> {
    const configs = await db.guildConfig.findMany({
        where: { td2ReportFeedChannelId: { not: null }, guild: { leftAt: null } },
        select: { guildId: true, td2ReportFeedChannelId: true },
    });
    return configs.flatMap(({ guildId, td2ReportFeedChannelId }) =>
        td2ReportFeedChannelId ? [{ guildId, channelId: td2ReportFeedChannelId }] : [],
    );
}

export interface Td2ReportFilters {
    status?: Td2ReportStatus;
    /** Une partie du pseudo, sans tenir compte de la casse */
    q?: string;
    /** L'ID du dernier signalement de la page précédente */
    cursor?: number;
    take?: number;
}

/** Tous les signalements du réseau, du plus récent au plus ancien : la page d'administration. */
export async function listTd2ReportsForAdmin(
    db: Db,
    { status, q, cursor, take = 25 }: Td2ReportFilters,
) {
    const search = q ? normalizePlayerName(q) : '';
    const reports = await db.td2Report.findMany({
        where: {
            ...(status && { status }),
            ...(search && { playerNameLower: { contains: search } }),
            ...(cursor && { id: { lt: cursor } }),
        },
        include: { guild: { select: { name: true } } },
        orderBy: { id: 'desc' },
        // Un de plus que la page : s'il existe, il y a une page suivante
        take: take + 1,
    });
    const page = reports.slice(0, take);
    return { reports: page, nextCursor: reports.length > take ? (page.at(-1)?.id ?? null) : null };
}

/** Supprime un signalement. Renvoie ce qu'il faut encore nettoyer (preuves, embed du staff), ou null. */
export async function deleteTd2Report(db: Db, id: number) {
    const report = await db.td2Report.findUnique({ where: { id } });
    if (!report) return null;
    const { count } = await db.td2Report.deleteMany({ where: { id } });
    return count > 0 ? report : null;
}