import { readFile as fsReadFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Ce que pèse le processus, lu à un instant. */
export interface ProcessReading {
  /** CPU utilisé depuis la lecture précédente, en % des CPU permis (100 = tous occupés) */
  cpu: number;
  /** Mémoire utilisée, en octets */
  memory: number;
  /** Limite de mémoire du conteneur, en octets ; null sans limite (ou hors conteneur) */
  memoryLimit: number | null;
  /** Retard moyen de la boucle d'événements depuis la lecture précédente, en millisecondes */
  eventLoopDelayMs: number;
  /** Depuis combien de secondes le processus tourne */
  uptime: number;
  /** 'cgroup' : lu dans le conteneur ; 'process' : repli de Node (en dev, hors Docker) */
  source: 'cgroup' | 'process';
}

export interface ProcessMeter {
  read(): Promise<ProcessReading>;
  /** Arrête la mesure du retard de boucle */
  stop(): void;
}

/** `usage_usec` de cpu.stat : le temps CPU consommé par le conteneur, en microsecondes. */
export function parseCpuStat(text: string): number {
  const match = /^usage_usec\s+(\d+)$/m.exec(text);
  if (!match) throw new Error('cpu.stat sans usage_usec');
  return Number(match[1]);
}

/** cpu.max (« quota période ») : le nombre de CPU permis ; null pour « max », sans limite. */
export function parseCpuMax(text: string): number | null {
  const [quota, period] = text.trim().split(/\s+/);
  if (quota === 'max') return null;
  const value = Number(quota) / Number(period);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`cpu.max illisible : ${text}`);
  return value;
}

/** memory.current ou memory.max, en octets ; null pour « max ». */
export function parseMemoryValue(text: string): number | null {
  const value = text.trim();
  if (value === 'max') return null;
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) throw new Error(`Valeur mémoire illisible : ${text}`);
  return bytes;
}

/** `inactive_file` de memory.stat : du cache disque que le noyau reprend au besoin. */
export function parseInactiveFile(text: string): number {
  const match = /^inactive_file\s+(\d+)$/m.exec(text);
  return match ? Number(match[1]) : 0;
}

export interface ProcessMeterOptions {
  /** Le dossier du cgroup du conteneur */
  cgroupRoot?: string;
  /**
   * Le cgroup du processus. « 0::/ » : il a son propre espace de noms, il est dans un conteneur.
   * Sinon (en dev), /sys/fs/cgroup est celui de toute la machine : on ne le lit pas.
   */
  selfCgroupFile?: string;
  readFile?: (path: string) => Promise<string>;
  /** Horloge en millisecondes, pour les tests */
  now?: () => number;
  /** Le repli hors conteneur, pour les tests */
  processStats?: () => { cpuMicros: number; rss: number; uptime: number };
}

const nodeProcessStats = () => {
  const cpu = process.cpuUsage();
  return {
    cpuMicros: cpu.user + cpu.system,
    rss: process.memoryUsage.rss(),
    uptime: process.uptime(),
  };
};

/**
 * Mesure le processus de l'intérieur de son conteneur (cgroup v2), comme `docker stats` :
 * sans accès au socket Docker. Hors conteneur, se replie sur ce que Node sait de lui-même.
 * Chaque appel à `read()` donne le CPU depuis l'appel précédent (depuis le lancement au premier).
 */
export function createProcessMeter(options: ProcessMeterOptions = {}): ProcessMeter {
  const {
    cgroupRoot = '/sys/fs/cgroup',
    selfCgroupFile = '/proc/self/cgroup',
    readFile = (path: string) => fsReadFile(path, 'utf8'),
    now = () => performance.timeOrigin + performance.now(),
    processStats = nodeProcessStats,
  } = options;

  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();

  const file = (name: string) => readFile(join(cgroupRoot, name));

  /** Une seule fois : le processus ne change pas de conteneur en cours de route. */
  const inContainer: Promise<boolean> = readFile(selfCgroupFile)
    .then(async (text) => {
      if (text.trim() !== '0::/') return false;
      parseCpuStat(await file('cpu.stat'));
      return true;
    })
    .catch(() => false);

  const readCgroup = async () => {
    const [stat, max, current, limit, memoryStat] = await Promise.all([
      file('cpu.stat'),
      file('cpu.max').catch(() => 'max'),
      file('memory.current'),
      file('memory.max').catch(() => 'max'),
      file('memory.stat').catch(() => ''),
    ]);
    const used = parseMemoryValue(current) ?? 0;
    return {
      cpuMicros: parseCpuStat(stat),
      cpus: parseCpuMax(max) ?? availableParallelism(),
      // Comme `docker stats` : sans le cache disque inactif, que le noyau reprend au besoin
      memory: Math.max(0, used - parseInactiveFile(memoryStat)),
      memoryLimit: parseMemoryValue(limit),
    };
  };

  const readProcess = () => {
    const stats = processStats();
    return {
      cpuMicros: stats.cpuMicros,
      cpus: availableParallelism(),
      memory: stats.rss,
      memoryLimit: null,
    };
  };

  // Le point de départ du premier calcul : le lancement du processus. cpu.stat et
  // process.cpuUsage() comptent depuis là, et une fenêtre de quelques millisecondes au démarrage
  // donnerait un chiffre absurde.
  let previous = { cpuMicros: 0, at: now() - processStats().uptime * 1000 };

  return {
    async read() {
      const cgroup = await inContainer;
      const start = previous;
      const current = cgroup ? await readCgroup() : readProcess();
      const at = now();
      previous = { cpuMicros: current.cpuMicros, at };

      const elapsedMicros = (at - start.at) * 1000;
      const share = (current.cpuMicros - start.cpuMicros) / (elapsedMicros * current.cpus);
      // Borné : les compteurs du noyau et l'horloge ne tombent pas pile au même instant
      const cpu = elapsedMicros > 0 ? Math.min(100, Math.max(0, share * 100)) : 0;
      // Nanosecondes ; NaN tant qu'aucune mesure n'a été prise
      const delay = loop.mean;
      loop.reset();

      return {
        cpu,
        memory: current.memory,
        memoryLimit: current.memoryLimit,
        eventLoopDelayMs: Number.isFinite(delay) ? delay / 1e6 : 0,
        uptime: processStats().uptime,
        source: cgroup ? 'cgroup' : 'process',
      };
    },
    stop() {
      loop.disable();
    },
  };
}
