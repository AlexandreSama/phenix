import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createProcessMeter,
  parseCpuMax,
  parseCpuStat,
  parseInactiveFile,
  parseMemoryValue,
  type ProcessMeter,
} from './process-meter.js';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('lecture des fichiers cgroup', () => {
  it('lit le temps CPU, la limite de CPU et la mémoire', async () => {
    expect(parseCpuStat(await readFile(fixture('limited/cpu.stat'), 'utf8'))).toBe(2_500_000);
    expect(parseCpuMax(await readFile(fixture('limited/cpu.max'), 'utf8'))).toBe(1.5);
    expect(parseCpuMax('max 100000\n')).toBeNull();
    expect(parseMemoryValue('536870912\n')).toBe(536_870_912);
    expect(parseMemoryValue('max\n')).toBeNull();
    expect(parseInactiveFile('anon 1\ninactive_file 42\n')).toBe(42);
    expect(parseInactiveFile('anon 1\n')).toBe(0);
  });

  it('refuse un fichier illisible plutôt que de rendre un faux chiffre', () => {
    expect(() => parseCpuStat('nr_periods 0')).toThrow('cpu.stat sans usage_usec');
    expect(() => parseCpuMax('abc 100000')).toThrow('cpu.max illisible');
    expect(() => parseMemoryValue('beaucoup')).toThrow('Valeur mémoire illisible');
  });
});

/** Un faux système de fichiers : le dossier d'exemple, et le cgroup du processus. */
function fakeFs(dir: string, selfCgroup: string, overrides: Record<string, string> = {}) {
  return async (path: string) => {
    if (path === '/proc/self/cgroup') return selfCgroup;
    const name = path.split('/').at(-1) ?? '';
    if (name in overrides) return overrides[name] ?? '';
    return readFile(fixture(`${dir}/${name}`), 'utf8');
  };
}

let meter: ProcessMeter | undefined;
afterEach(() => meter?.stop());

describe('createProcessMeter', () => {
  it('dans un conteneur limité : CPU rapporté aux CPU permis, mémoire sans le cache inactif', async () => {
    let clock = 0;
    let usage = 2_500_000;
    const read = fakeFs('limited', '0::/\n');
    meter = createProcessMeter({
      cgroupRoot: '/sys/fs/cgroup',
      readFile: (path) =>
        path.endsWith('cpu.stat') ? Promise.resolve(`usage_usec ${usage}\n`) : read(path),
      now: () => clock,
      // Lancé depuis 10 s
      processStats: () => ({ cpuMicros: 0, rss: 0, uptime: 10 }),
    });

    // Première lecture : la moyenne depuis le lancement, 2,5 s de CPU en 10 s sur 1,5 CPU
    const first = await meter.read();
    expect(first.cpu).toBeCloseTo(100 / 6);
    expect(first).toMatchObject({
      memory: 268_435_456 - 16_777_216,
      memoryLimit: 536_870_912,
      uptime: 10,
      source: 'cgroup',
    });
    expect(first.eventLoopDelayMs).toBeGreaterThanOrEqual(0);

    // 10 s plus tard, 7,5 s de CPU sur 1,5 CPU permis : 50 %
    clock = 10_000;
    usage += 7_500_000;
    expect((await meter.read()).cpu).toBe(50);

    // La lecture suivante repart de celle-ci : rien consommé, 0 %
    clock = 20_000;
    expect((await meter.read()).cpu).toBe(0);
  });

  it('sans limite : tous les CPU de la machine, pas de limite de mémoire', async () => {
    let clock = 0;
    let usage = 0;
    const read = fakeFs('unlimited', '0::/');
    meter = createProcessMeter({
      readFile: (path) =>
        path.endsWith('cpu.stat') ? Promise.resolve(`usage_usec ${usage}\n`) : read(path),
      now: () => clock,
      processStats: () => ({ cpuMicros: 0, rss: 0, uptime: 1 }),
    });
    await meter.read();

    clock = 1000;
    usage += 1_000_000;
    const reading = await meter.read();

    expect(reading.cpu).toBeCloseTo(100 / availableParallelism());
    expect(reading).toMatchObject({ memory: 104_857_600, memoryLimit: null, source: 'cgroup' });
  });

  it('hors conteneur (cgroup de la machine), se replie sur Node, et borne à 100 %', async () => {
    let clock = 0;
    let cpuMicros = 2_000_000 * availableParallelism();
    meter = createProcessMeter({
      readFile: fakeFs('limited', '0::/user.slice/user-1000.slice/session-2.scope\n'),
      now: () => clock,
      processStats: () => ({ cpuMicros, rss: 50_000_000, uptime: 2 }),
    });

    expect(await meter.read()).toMatchObject({
      cpu: 100,
      memory: 50_000_000,
      memoryLimit: null,
      source: 'process',
    });

    clock = 1000;
    cpuMicros += 5_000_000 * availableParallelism();
    expect((await meter.read()).cpu).toBe(100);
  });

  it('se replie aussi quand les fichiers cgroup manquent (cgroup v1)', async () => {
    meter = createProcessMeter({
      readFile: async (path) => {
        if (path === '/proc/self/cgroup') return '0::/';
        throw Object.assign(new Error('absent'), { code: 'ENOENT' });
      },
      processStats: () => ({ cpuMicros: 0, rss: 1, uptime: 1 }),
    });
    expect((await meter.read()).source).toBe('process');
  });

  it('mesure vraiment le processus en cours, sans options', async () => {
    meter = createProcessMeter();
    const reading = await meter.read();
    expect(reading.memory).toBeGreaterThan(0);
    expect(reading.cpu).toBeGreaterThanOrEqual(0);
    expect(reading.cpu).toBeLessThanOrEqual(100);
  });
});
