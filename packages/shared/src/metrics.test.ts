import { describe, expect, it } from 'vitest';
import {
  metricsRangeQuerySchema,
  metricsSeriesQuerySchema,
  serviceHeartbeatSchema,
} from './metrics.js';

describe('metricsRangeQuerySchema', () => {
  it('prend 24 h par défaut et refuse une plage inconnue', () => {
    expect(metricsRangeQuerySchema.parse({})).toEqual({ range: '24h' });
    expect(metricsRangeQuerySchema.parse({ range: '30d' })).toEqual({ range: '30d' });
    expect(metricsRangeQuerySchema.safeParse({ range: '1y' }).success).toBe(false);
  });
});

describe('metricsSeriesQuerySchema', () => {
  it('découpe les noms, retire les doublons', () => {
    expect(
      metricsSeriesQuerySchema.parse({ names: 'bot.cpu, api.cpu,bot.cpu', range: '7d' }),
    ).toEqual({ names: ['bot.cpu', 'api.cpu'], range: '7d' });
    expect(
      metricsSeriesQuerySchema.parse({ names: 'garage.media.bytes,garage.media.objects' }).names,
    ).toHaveLength(2);
  });

  it('refuse un relevé inconnu, une liste vide ou trop longue', () => {
    for (const names of ['bot.disk', 'garage..bytes', 'postgres.bytes;drop', '']) {
      expect(metricsSeriesQuerySchema.safeParse({ names }).success).toBe(false);
    }
    const many = Array.from({ length: 13 }, (_, i) => `garage.b${i}.bytes`).join(',');
    expect(metricsSeriesQuerySchema.safeParse({ names: many }).success).toBe(false);
  });
});

describe('serviceHeartbeatSchema', () => {
  it('accepte le battement de l’API, sans serveurs ni ping', () => {
    const beat = {
      at: '2026-11-11T09:00:00.000Z',
      cpu: 12.5,
      memory: 120_000_000,
      memoryLimit: null,
      uptime: 60,
      version: 'dev',
      eventLoopDelayMs: 1.2,
    };
    expect(serviceHeartbeatSchema.parse(beat)).toEqual(beat);
    expect(serviceHeartbeatSchema.safeParse({ ...beat, cpu: -1 }).success).toBe(false);
  });
});
