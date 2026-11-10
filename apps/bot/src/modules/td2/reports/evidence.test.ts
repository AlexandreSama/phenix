import { describe, expect, it, vi } from 'vitest';
import { checkEvidence, EVIDENCE_REPLIES, storeEvidence } from './evidence.js';

const image = (name: string, overrides: Record<string, unknown> = {}) => ({
    name,
    url: `https://cdn.discordapp.com/${name}`,
    size: 1000,
    contentType: 'image/png',
    ...overrides,
});

function fakeStorage() {
    return {
        put: vi.fn(async () => {}),
        getText: vi.fn(),
        getBytes: vi.fn(),
        delete: vi.fn(async () => {}),
    };
}

const ok = (bytes: number[]) =>
    vi.fn(async () => new Response(Uint8Array.from(bytes), { status: 200 }));

describe('checkEvidence', () => {
    it('accepte des captures, refuse une vidéo ou un fichier trop lourd', () => {
        expect(checkEvidence([image('a.png'), image('b.jpg', { contentType: 'image/jpeg' })])).toBe(
            null,
        );
        expect(checkEvidence([image('clip.mp4', { contentType: 'video/mp4' })])).toBe(
            EVIDENCE_REPLIES.type('clip.mp4'),
        );
        expect(checkEvidence([image('gros.png', { size: 9 * 1024 * 1024 })])).toBe(
            EVIDENCE_REPLIES.size('gros.png'),
        );
        expect(checkEvidence([image('sans-type', { contentType: null })])).toBe(
            EVIDENCE_REPLIES.type('sans-type'),
        );
    });
});

describe('storeEvidence', () => {
    it('range chaque capture dans le bucket, sous le serveur, avec un nom imprévisible', async () => {
        const storage = fakeStorage();

        const stored = await storeEvidence(storage, '42', [image('a.png')], ok([1, 2, 3]));

        expect(stored).toHaveLength(1);
        expect(stored[0]?.key).toMatch(/^td2-reports\/42\/[0-9a-f-]{36}\.png$/);
        expect(stored[0]?.fileName).toBe('preuve-1.png');
        expect(storage.put).toHaveBeenCalledWith(
            stored[0]?.key,
            Uint8Array.from([1, 2, 3]),
            'image/png',
        );
    });

    it('un téléchargement raté retire ce qui était déjà rangé', async () => {
        const storage = fakeStorage();
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response(Uint8Array.from([1]), { status: 200 }))
            .mockResolvedValueOnce(new Response(null, { status: 404 }));

        await expect(
            storeEvidence(storage, '42', [image('a.png'), image('b.png')], fetchImpl),
        ).rejects.toThrow('404');
        const firstKey = (storage.put.mock.calls[0] as unknown as [string])[0];
        expect(storage.delete).toHaveBeenCalledWith([firstKey]);
    });
});