import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { GUILD, REPORTER, td2Report } from '../test-fixtures.js';
import { lookupPlayer, REPORT_REPLIES, reportPlayer, REPORTS_PER_HOUR } from './command.js';

const database = vi.hoisted(() => ({
    countRecentTd2Reports: vi.fn(),
    createTd2Report: vi.fn(),
    deleteTd2Report: vi.fn(),
    listPlayerReports: vi.fn(),
    markTd2ReportPosted: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const STAFF_CHANNEL = '400000000000000005';
const STAFF_ROLE = '600000000000000001';

interface Options {
    strings?: Record<string, string>;
    attachments?: Record<string, { name: string; url: string; size: number; contentType: string }>;
    settings?: Record<string, unknown> | null;
    writable?: boolean;
    send?: ReturnType<typeof vi.fn>;
    roles?: string[];
}

function setup({
                   strings = { plateforme: 'PSN', pseudo: ' Agent47 ', motif: 'CHEAT' },
                   attachments = {},
                   settings = {
                       td2ReportChannelId: STAFF_CHANNEL,
                       staffRoleIds: [STAFF_ROLE],
                       td2ReportViewerRoleIds: [],
                   },
                   writable = true,
                   send = vi.fn(async () => ({ id: '900000000000000007' })),
                   roles = [],
               }: Options = {}) {
    const channel = {
        id: STAFF_CHANNEL,
        isSendable: () => true,
        permissionsFor: () => ({ has: () => writable }),
        send,
    };
    const interaction = {
        guildId: GUILD,
        user: { id: REPORTER },
        member: { permissions: { has: () => false }, roles: { cache: new Set(roles) } },
        guild: {
            members: { me: {} },
            channels: { cache: new Map([[STAFF_CHANNEL, channel]]), fetch: vi.fn(async () => null) },
        },
        options: {
            getString: (name: string) => strings[name] ?? null,
            getAttachment: (name: string) => attachments[name] ?? null,
        },
        reply: vi.fn(async () => {}),
        deferReply: vi.fn(async () => {}),
        editReply: vi.fn(async () => {}),
    };
    const evidence = {
        put: vi.fn(async () => {}),
        getText: vi.fn(),
        getBytes: vi.fn(),
        delete: vi.fn(async () => {}),
    };
    const context = {
        db: {},
        evidence,
        logger: { info: vi.fn(), warn: vi.fn() },
        configs: { get: vi.fn(async () => settings) },
    } as unknown as BotContext;
    const said = (mock: typeof interaction.reply) =>
        (mock.mock.calls.at(-1) as unknown as [{ content?: string } | string] | undefined)?.[0];
    const run = (handler: typeof reportPlayer) =>
        handler(interaction as unknown as ChatInputCommandInteraction<'cached'>, context);
    return { channel, interaction, evidence, context, said, run };
}

beforeEach(() => {
    for (const mock of Object.values(database)) mock.mockReset();
    database.countRecentTd2Reports.mockResolvedValue(0);
    vi.unstubAllGlobals();
});

describe('/td2 signaler', () => {
    it('enregistre la capture, crée le signalement et le poste chez le staff, captures jointes', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), { status: 200 })),
        );
        database.createTd2Report.mockImplementation(async (_db: unknown, input: object) =>
            td2Report(input),
        );
        const { channel, interaction, evidence, said, run } = setup({
            attachments: {
                preuve: { name: 'mur.png', url: 'https://cdn/mur.png', size: 3, contentType: 'image/png' },
            },
        });

        await run(reportPlayer);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(evidence.put).toHaveBeenCalledOnce();
        expect(database.createTd2Report).toHaveBeenCalledWith(
            {},
            expect.objectContaining({
                guildId: GUILD,
                reporterId: REPORTER,
                playerName: 'Agent47',
                platform: 'PSN',
                reason: 'CHEAT',
                evidenceKeys: [expect.stringMatching(/^td2-reports\//)],
            }),
        );
        expect(channel.send).toHaveBeenCalledWith(
            expect.objectContaining({ files: [expect.objectContaining({ name: 'preuve-1.png' })] }),
        );
        expect(database.markTd2ReportPosted).toHaveBeenCalledWith({}, 7, '900000000000000007');
        expect(said(interaction.editReply)).toBe(REPORT_REPLIES.sent(7, true));
    });

    it('refuse sans salon du staff, ou après trop de signalements dans l’heure', async () => {
        const closed = setup({ settings: { td2ReportChannelId: null } });
        await closed.run(reportPlayer);
        expect(closed.said(closed.interaction.reply)).toMatchObject({ content: REPORT_REPLIES.closed });

        database.countRecentTd2Reports.mockResolvedValue(REPORTS_PER_HOUR);
        const spam = setup();
        await spam.run(reportPlayer);
        expect(spam.said(spam.interaction.reply)).toMatchObject({ content: REPORT_REPLIES.tooMany });
        expect(database.createTd2Report).not.toHaveBeenCalled();
    });

    it('refuse une vidéo avant tout téléchargement', async () => {
        const { interaction, evidence, said, run } = setup({
            attachments: {
                preuve: {
                    name: 'clip.mp4',
                    url: 'https://cdn/clip.mp4',
                    size: 3,
                    contentType: 'video/mp4',
                },
            },
        });

        await run(reportPlayer);

        expect(said(interaction.reply)).toMatchObject({ content: expect.stringContaining('clip.mp4') });
        expect(evidence.put).not.toHaveBeenCalled();
    });

    it('salon du staff fermé au bot : le dit, sans rien enregistrer', async () => {
        const { interaction, said, run } = setup({ writable: false });

        await run(reportPlayer);

        expect(said(interaction.reply)).toMatchObject({
            content: REPORT_REPLIES.staffUnreachable(STAFF_CHANNEL),
        });
        expect(database.createTd2Report).not.toHaveBeenCalled();
    });

    it('message impossible à poster : le signalement et ses captures sont retirés', async () => {
        database.createTd2Report.mockResolvedValue(td2Report());
        const { evidence, interaction, said, run } = setup({
            send: vi.fn(async () => {
                throw new Error('panne');
            }),
        });

        await run(reportPlayer);

        expect(database.deleteTd2Report).toHaveBeenCalledWith({}, 7);
        expect(evidence.delete).toHaveBeenCalledWith(['td2-reports/1/a.png']);
        expect(said(interaction.editReply)).toContain("n'a pas pu être envoyé");
    });

    it('sans capture : envoyé quand même, avec un avertissement', async () => {
        database.createTd2Report.mockResolvedValue(td2Report({ evidenceKeys: [] }));
        const { interaction, said, run } = setup();

        await run(reportPlayer);

        expect(said(interaction.editReply)).toBe(REPORT_REPLIES.sent(7, false));
    });
});

describe('/td2 signalements', () => {
    it('réservé à l’équipe et aux rôles choisis sur le site', async () => {
        const { interaction, said, run } = setup();

        await run(lookupPlayer);

        expect(said(interaction.reply)).toMatchObject({ content: REPORT_REPLIES.forbidden });
        expect(database.listPlayerReports).not.toHaveBeenCalled();
    });

    it('liste ce que ce serveur a le droit de voir', async () => {
        database.listPlayerReports.mockResolvedValue([]);
        const { interaction, run } = setup({ roles: [STAFF_ROLE] });

        await run(lookupPlayer);

        expect(database.listPlayerReports).toHaveBeenCalledWith(
            {},
            { platform: 'PSN', playerName: 'Agent47', viewerGuildId: GUILD },
        );
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: [expect.anything()] }),
        );
    });
});