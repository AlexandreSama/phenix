import { recordCommandUsage, type CommandUsageEntry } from '@phenix/database';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Logger } from 'pino';

/** Une commande lancée : où, laquelle, combien de temps, et si elle a planté. Jamais qui. */
export interface CommandUse {
  /** null hors serveur (message privé) */
  guildId: string | null;
  command: string;
  durationMs: number;
  ok: boolean;
}

export interface CommandUsageRecorder {
  /** Compte une commande en mémoire. Ne lève jamais d'erreur. */
  record(use: CommandUse): void;
  /** Écrit en base ce qui a été compté depuis la dernière écriture. Ne lève jamais d'erreur. */
  flush(): Promise<void>;
  /** Arrête l'écriture régulière et écrit un dernier lot (arrêt propre du bot). */
  stop(): Promise<void>;
}

interface RecorderOptions {
  write: (entries: CommandUsageEntry[]) => Promise<void>;
  logger: Pick<Logger, 'warn'>;
  intervalMs: number;
  now?: () => Date;
  /** Au-delà, si la base ne répond plus, les nouveaux comptes sont perdus plutôt que la mémoire */
  maxEntries?: number;
}

const HOUR = 3600_000;

/** Le nom complet d'une commande, avec son groupe et sa sous-commande : « td2 mission ». */
export function fullCommandName(
  interaction: Pick<ChatInputCommandInteraction, 'commandName' | 'options'>,
): string {
  return [
    interaction.commandName,
    interaction.options.getSubcommandGroup(false),
    interaction.options.getSubcommand(false),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Compte les commandes en mémoire, heure par heure, et les écrit en base par lot toutes les
 * `intervalMs`. Une écriture qui échoue est retentée au lot suivant ; elle ne touche jamais une
 * commande en cours.
 */
export function createCommandUsageRecorder({
  write,
  logger,
  intervalMs,
  now = () => new Date(),
  maxEntries = 10_000,
}: RecorderOptions): CommandUsageRecorder {
  let pending = new Map<string, CommandUsageEntry>();
  let writing: Promise<void> | undefined;

  const add = (entry: CommandUsageEntry) => {
    const key = `${entry.hour.getTime()}|${entry.guildId}|${entry.command}`;
    const existing = pending.get(key);
    if (existing) {
      existing.count += entry.count;
      existing.errors += entry.errors;
      existing.totalDurationMs += entry.totalDurationMs;
      return;
    }
    if (pending.size >= maxEntries) return;
    pending.set(key, { ...entry });
  };

  const writeBatch = async () => {
    if (pending.size === 0) return;
    const batch = [...pending.values()];
    pending = new Map();
    try {
      await write(batch);
    } catch (err) {
      // Remis de côté pour le prochain lot, avec ce qui a été compté entre-temps
      for (const entry of batch) add(entry);
      logger.warn(
        { err, entries: batch.length },
        'Usage des commandes non écrit, nouvel essai au prochain lot',
      );
    }
  };

  const flush = async () => {
    // Un lot à la fois : le suivant attend que le précédent soit écrit
    while (writing) await writing;
    writing = writeBatch().finally(() => {
      writing = undefined;
    });
    await writing;
  };

  const timer = setInterval(() => void flush(), intervalMs);
  timer.unref();

  return {
    record({ guildId, command, durationMs, ok }) {
      const at = now().getTime();
      add({
        hour: new Date(Math.floor(at / HOUR) * HOUR),
        guildId: guildId ?? '',
        command,
        count: 1,
        errors: ok ? 0 : 1,
        totalDurationMs: Math.max(0, Math.round(durationMs)),
      });
    },
    flush,
    async stop() {
      clearInterval(timer);
      await flush();
    },
  };
}

/** Le compteur branché sur la base du bot. */
export const createDbCommandUsageRecorder = (
  db: Parameters<typeof recordCommandUsage>[0],
  options: Omit<RecorderOptions, 'write'>,
) =>
  createCommandUsageRecorder({ ...options, write: (entries) => recordCommandUsage(db, entries) });
