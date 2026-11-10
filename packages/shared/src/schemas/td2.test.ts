import { describe, expect, it } from 'vitest';
import {
    td2ActivityPatchSchema,
    td2ModeInputSchema,
    td2ReportQuerySchema,
    td2SettingsSchema,
} from './td2.js';

const CHANNEL = '100000000000000001';

const settings = {
    channelId: CHANNEL,
    reportChannelId: null,
    reportViewerRoleIds: [],
    reportFeedChannelId: null,
};

describe('td2SettingsSchema', () => {
    it('accepte des salons ou aucun, refuse un ID illisible', () => {
        expect(td2SettingsSchema.safeParse(settings).success).toBe(true);
        expect(td2SettingsSchema.safeParse({ ...settings, channelId: null }).success).toBe(true);
        expect(
            td2SettingsSchema.safeParse({ ...settings, reportChannelId: 'salon' }).error?.issues[0]
                ?.message,
        ).toBe('ID Discord invalide');
    });

    it('limite les rôles qui consultent les signalements à 25', () => {
        const roles = Array.from(
            { length: 26 },
            (_, i) => `2000000000000000${String(i).padStart(2, '0')}`,
        );
        expect(
            td2SettingsSchema.safeParse({ ...settings, reportViewerRoleIds: roles }).error?.issues[0]
                ?.message,
        ).toBe('25 rôles au plus');
    });
});

const mode = (slots: Record<string, number>) =>
    td2ModeInputSchema.safeParse({
        name: 'Normal',
        slots: { DPS: 0, HEAL: 0, TANK: 0, HEAL_TANK: 0, ...slots },
    });

describe('catalogue', () => {
    it('un mode compte entre 1 et 8 joueurs', () => {
        expect(mode({ DPS: 6, HEAL: 1, TANK: 1 }).success).toBe(true);
        expect(mode({ DPS: 3, HEAL_TANK: 1 }).success).toBe(true);
        expect(mode({}).error?.issues[0]?.message).toBe('Entre 1 et 8 joueurs au total');
        expect(mode({ DPS: 7, TANK: 2 }).error?.issues[0]?.message).toBe(
            'Entre 1 et 8 joueurs au total',
        );
        expect(mode({ DPS: 1.5 }).error?.issues[0]?.message).toBe('Un nombre entier');
    });

    it('un nom est rogné, et pas vide', () => {
        expect(td2ModeInputSchema.safeParse({ name: '   ', slots: {} }).error?.issues[0]?.message).toBe(
            'Donne un nom',
        );
        expect(td2ActivityPatchSchema.parse({ name: '  Dark Hours ' })).toEqual({ name: 'Dark Hours' });
    });

    it('une modification change au moins un champ', () => {
        expect(td2ActivityPatchSchema.safeParse({}).error?.issues[0]?.message).toBe('Rien à modifier');
        expect(td2ActivityPatchSchema.parse({ active: false })).toEqual({ active: false });
    });
});

describe('td2ReportQuerySchema', () => {
    it('lit les filtres de l’URL', () => {
        expect(td2ReportQuerySchema.parse({ status: 'PENDING', q: ' Agent ', cursor: '42' })).toEqual({
            status: 'PENDING',
            q: 'Agent',
            cursor: 42,
        });
        expect(td2ReportQuerySchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
    });
});