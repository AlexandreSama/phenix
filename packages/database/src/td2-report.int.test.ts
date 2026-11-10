import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import {
    countRecentTd2Reports,
    createTd2Report,
    deleteTd2Report,
    findTd2Report,
    listPlayerReports,
    listTd2FeedChannels,
    listTd2ReportsForAdmin,
    markTd2ReportPosted,
    reviewTd2Report,
    type NewTd2Report,
} from './td2-reports.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
    await prisma.$disconnect();
});

const NOW = new Date('2026-11-10T12:00:00Z');
// Un pseudo propre à ce lancement : les recherches ne voient pas les autres fichiers
const run = newGuildId().slice(-8);

async function newGuild(name = 'Serveur de test', feedChannelId: string | null = null) {
    const id = newGuildId();
    await prisma.guild.create({
        data: { id, name, config: { create: { td2ReportFeedChannelId: feedChannelId } } },
    });
    return id;
}

const report = (guildId: string, overrides: Partial<NewTd2Report> = {}) =>
    createTd2Report(prisma, {
        guildId,
        reporterId: '500000000000000001',
        playerName: `Agent${run}`,
        platform: 'PSN',
        reason: 'CHEAT',
        details: 'Tir à travers les murs en Dark Hours',
        evidenceKeys: ['td2-reports/a.png'],
        ...overrides,
    });

describe('création et examen', () => {
    it('enregistre le pseudo tel que saisi, et sa forme comparable', async () => {
        const guildId = await newGuild();

        const created = await report(guildId, { playerName: `  Agent${run} ` });
        await markTd2ReportPosted(prisma, created.id, `9${run}1`);

        const found = await findTd2Report(prisma, created.id);
        expect(found).toMatchObject({
            playerName: `Agent${run}`,
            playerNameLower: `agent${run}`,
            status: 'PENDING',
            staffMessageId: `9${run}1`,
            guild: { name: 'Serveur de test' },
        });
    });

    it('seul le staff d’origine examine, et confirmer exige une preuve', async () => {
        const guildId = await newGuild();
        const other = await newGuild();
        const withProof = await report(guildId);
        const withoutProof = await report(guildId, { evidenceKeys: [] });
        const review = (id: number, status: 'IN_REVIEW' | 'CONFIRMED', from = guildId) =>
            reviewTd2Report(prisma, { id, guildId: from, status, reviewerId: '7', now: NOW });

        expect(await review(withProof.id, 'CONFIRMED', other)).toEqual({ status: 'missing' });
        expect(await review(withoutProof.id, 'CONFIRMED')).toEqual({ status: 'no-evidence' });
        expect(await review(withoutProof.id, 'IN_REVIEW')).toMatchObject({
            status: 'reviewed',
            previous: 'PENDING',
            report: { status: 'IN_REVIEW', reviewedById: '7', reviewedAt: NOW },
        });
        expect(await review(withProof.id, 'CONFIRMED')).toMatchObject({ status: 'reviewed' });
        expect(await review(withProof.id, 'CONFIRMED')).toEqual({
            status: 'unchanged',
            current: 'CONFIRMED',
        });
        // Confirmé, il est parti dans le fil du réseau : le staff ne peut plus le rejeter
        expect(await review(withProof.id, 'IN_REVIEW')).toEqual({ status: 'final' });
    });

    it('compte les signalements récents d’un membre sur un serveur', async () => {
        const guildId = await newGuild();
        await report(guildId);
        await report(guildId);
        await report(guildId, { reporterId: '500000000000000002' });

        const since = new Date(Date.now() - 3_600_000);
        expect(
            await countRecentTd2Reports(prisma, { guildId, reporterId: '500000000000000001', since }),
        ).toBe(2);
        expect(
            await countRecentTd2Reports(prisma, {
                guildId,
                reporterId: '500000000000000001',
                since: new Date(Date.now() + 60_000),
            }),
        ).toBe(0);
    });

    it('deux clics en même temps : un seul examen est enregistré', async () => {
        const guildId = await newGuild();
        const created = await report(guildId);

        const results = await Promise.all([
            reviewTd2Report(prisma, { id: created.id, guildId, status: 'CONFIRMED', reviewerId: '7' }),
            reviewTd2Report(prisma, { id: created.id, guildId, status: 'REJECTED', reviewerId: '8' }),
        ]);

        expect(results.filter((result) => result.status === 'reviewed')).toHaveLength(1);
    });
});

describe('ce que voit chaque serveur', () => {
    it('le serveur d’origine voit tout ; les autres ni les rejetés, ni l’auteur', async () => {
        const origin = await newGuild('Origine');
        const viewer = await newGuild('Voisin');
        const player = `Hunter${run}`;
        const pending = await report(origin, { playerName: player });
        const confirmed = await report(origin, { playerName: player });
        const rejected = await report(origin, { playerName: player });
        await reviewTd2Report(prisma, {
            id: confirmed.id,
            guildId: origin,
            status: 'CONFIRMED',
            reviewerId: '7',
        });
        await reviewTd2Report(prisma, {
            id: rejected.id,
            guildId: origin,
            status: 'REJECTED',
            reviewerId: '7',
        });

        const fromOrigin = await listPlayerReports(prisma, {
            platform: 'PSN',
            playerName: player.toUpperCase(),
            viewerGuildId: origin,
        });
        const fromViewer = await listPlayerReports(prisma, {
            platform: 'PSN',
            playerName: player,
            viewerGuildId: viewer,
        });

        expect(fromOrigin.map((entry) => entry.id).toSorted((a, b) => a - b)).toEqual([
            pending.id,
            confirmed.id,
            rejected.id,
        ]);
        expect(
            fromOrigin.every((entry) => entry.own && entry.reporterId === '500000000000000001'),
        ).toBe(true);
        expect(fromViewer.map((entry) => [entry.id, entry.status, entry.reporterId])).toEqual(
            expect.arrayContaining([
                [pending.id, 'PENDING', null],
                [confirmed.id, 'CONFIRMED', null],
            ]),
        );
        expect(fromViewer).toHaveLength(2);
        // Les détails d'un signalement non vérifié restent au serveur d'origine
        expect(fromViewer.find((entry) => entry.id === pending.id)?.details).toBe(null);
        expect(fromViewer.find((entry) => entry.id === confirmed.id)?.details).toContain('murs');
    });

    it('un pseudo sur une autre plateforme est un autre joueur', async () => {
        const guildId = await newGuild();
        await report(guildId, { playerName: `Rogue${run}`, platform: 'XBL' });

        expect(
            await listPlayerReports(prisma, {
                platform: 'PSN',
                playerName: `Rogue${run}`,
                viewerGuildId: guildId,
            }),
        ).toEqual([]);
    });

    it('le fil du réseau : les serveurs qui l’ont réglé, sauf ceux que le bot a quittés', async () => {
        const feedGuild = await newGuild('Avec fil', `4${run}01`);
        const leftGuild = await newGuild('Parti', `4${run}02`);
        await prisma.guild.update({ where: { id: leftGuild }, data: { leftAt: NOW } });

        const channels = await listTd2FeedChannels(prisma);

        expect(channels).toContainEqual({ guildId: feedGuild, channelId: `4${run}01` });
        expect(channels.some((channel) => channel.guildId === leftGuild)).toBe(false);
    });
});

describe('administration', () => {
    it('filtre par statut et par pseudo, page par page', async () => {
        const guildId = await newGuild();
        const ids: number[] = [];
        for (let i = 0; i < 3; i++)
            ids.push((await report(guildId, { playerName: `Page${run}x${i}` })).id);
        await reviewTd2Report(prisma, { id: ids[0]!, guildId, status: 'CONFIRMED', reviewerId: '7' });

        const first = await listTd2ReportsForAdmin(prisma, { q: `page${run}`, take: 2 });
        const second = await listTd2ReportsForAdmin(prisma, {
            q: `page${run}`,
            take: 2,
            cursor: first.nextCursor ?? undefined,
        });
        const confirmed = await listTd2ReportsForAdmin(prisma, {
            q: `page${run}`,
            status: 'CONFIRMED',
        });

        expect(first.reports.map((entry) => entry.id)).toEqual([ids[2], ids[1]]);
        expect(second.reports.map((entry) => entry.id)).toEqual([ids[0]]);
        expect(second.nextCursor).toBe(null);
        expect(confirmed.reports.map((entry) => entry.id)).toEqual([ids[0]]);
        expect(first.reports[0]?.guild.name).toBe('Serveur de test');
    });

    it('supprime un signalement et rend ce qu’il reste à nettoyer', async () => {
        const guildId = await newGuild();
        const created = await report(guildId, { evidenceKeys: ['a.png', 'b.png'] });
        await markTd2ReportPosted(prisma, created.id, `9${run}2`);

        const deleted = await deleteTd2Report(prisma, created.id);

        expect(deleted).toMatchObject({ evidenceKeys: ['a.png', 'b.png'], staffMessageId: `9${run}2` });
        expect(await findTd2Report(prisma, created.id)).toBe(null);
        expect(await deleteTd2Report(prisma, created.id)).toBe(null);
    });
});