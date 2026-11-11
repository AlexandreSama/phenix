import type { PrismaClient } from './generated/prisma/client.js';

/*
 * Les métriques des propriétaires du bot (phase 11).
 *
 * Les colonnes sont des `timestamp` sans fuseau, en UTC. Dans le SQL écrit à la main, les dates
 * partent en texte ISO (`::timestamptz AT TIME ZONE 'UTC'`) et reviennent en texte ISO : le
 * résultat ne dépend pas du fuseau du processus ni de la conversion des dates par le pilote.
 */

/** Le format de to_char pour relire une colonne (UTC sans fuseau) en date ISO. */
const ISO_OUT = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';

export interface CommandUsageEntry {
  /** Début de l'heure, en UTC */
  hour: Date;
  /** '' hors serveur */
  guildId: string;
  command: string;
  count: number;
  errors: number;
  totalDurationMs: number;
}

/** Ajoute un lot d'utilisations aux compteurs, en une seule requête. */
export async function recordCommandUsage(
  db: Pick<PrismaClient, '$executeRaw'>,
  entries: readonly CommandUsageEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await db.$executeRaw`
    INSERT INTO "CommandUsage" ("hour", "guildId", "command", "count", "errors", "totalDurationMs")
    SELECT u.hour AT TIME ZONE 'UTC', u.guild, u.command, u.count, u.errors, u.duration
    FROM unnest(
      ${entries.map((e) => e.hour.toISOString())}::timestamptz[],
      ${entries.map((e) => e.guildId)}::text[],
      ${entries.map((e) => e.command)}::text[],
      ${entries.map((e) => e.count)}::int[],
      ${entries.map((e) => e.errors)}::int[],
      ${entries.map((e) => Math.round(e.totalDurationMs))}::int[]
    ) AS u(hour, guild, command, count, errors, duration)
    ON CONFLICT ("hour", "guildId", "command") DO UPDATE SET
      "count" = "CommandUsage"."count" + EXCLUDED."count",
      "errors" = "CommandUsage"."errors" + EXCLUDED."errors",
      "totalDurationMs" = "CommandUsage"."totalDurationMs" + EXCLUDED."totalDurationMs"`;
}

export interface CommandRankingRow {
  command: string;
  count: number;
  errors: number;
  avgDurationMs: number;
}

/** Les commandes depuis `since`, de la plus lancée à la moins lancée. */
export function commandRanking(
  db: Pick<PrismaClient, '$queryRaw'>,
  since: Date,
): Promise<CommandRankingRow[]> {
  return db.$queryRaw<CommandRankingRow[]>`
    SELECT "command",
      sum("count")::float8 AS "count",
      sum("errors")::float8 AS "errors",
      coalesce(sum("totalDurationMs")::float8 / nullif(sum("count"), 0), 0) AS "avgDurationMs"
    FROM "CommandUsage"
    WHERE "hour" >= ${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'
    GROUP BY "command"
    ORDER BY "count" DESC, "command"`;
}

export interface CommandDailyRow {
  /** AAAA-MM-JJ, dans le fuseau demandé */
  day: string;
  count: number;
  errors: number;
}

/** Le total des commandes par jour depuis `since`, jours comptés dans `timeZone`. */
export function commandDailyTotals(
  db: Pick<PrismaClient, '$queryRaw'>,
  since: Date,
  timeZone = 'Europe/Paris',
): Promise<CommandDailyRow[]> {
  return db.$queryRaw<CommandDailyRow[]>`
    SELECT to_char(("hour" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS "day",
      sum("count")::float8 AS "count",
      sum("errors")::float8 AS "errors"
    FROM "CommandUsage"
    WHERE "hour" >= ${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'
    GROUP BY "day"
    ORDER BY "day"`;
}

export interface CommandTotalsRow {
  count: number;
  errors: number;
  /** Les serveurs où au moins une commande a été lancée (hors messages privés) */
  guilds: number;
}

export async function commandTotals(
  db: Pick<PrismaClient, '$queryRaw'>,
  since: Date,
): Promise<CommandTotalsRow> {
  const [row] = await db.$queryRaw<CommandTotalsRow[]>`
    SELECT coalesce(sum("count"), 0)::float8 AS "count",
      coalesce(sum("errors"), 0)::float8 AS "errors",
      (count(DISTINCT "guildId") FILTER (WHERE "guildId" <> ''))::float8 AS "guilds"
    FROM "CommandUsage"
    WHERE "hour" >= ${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'`;
  return row ?? { count: 0, errors: 0, guilds: 0 };
}

export interface GuildRankingRow {
  id: string;
  /** null : un serveur absent de la table Guild */
  name: string | null;
  icon: string | null;
  count: number;
  topCommand: string;
  /** Début de la dernière heure où une commande a été lancée (ISO) */
  lastActiveAt: string;
}

/** Les serveurs qui lancent le plus de commandes depuis `since`, avec leur commande favorite. */
export function guildRanking(
  db: Pick<PrismaClient, '$queryRaw'>,
  since: Date,
  limit = 20,
): Promise<GuildRankingRow[]> {
  return db.$queryRaw<GuildRankingRow[]>`
    WITH usage AS (
      SELECT "guildId", "command", sum("count") AS uses, max("hour") AS last
      FROM "CommandUsage"
      WHERE "hour" >= ${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'
      GROUP BY "guildId", "command"
    ), per_guild AS (
      SELECT "guildId", sum(uses) AS uses, max(last) AS last FROM usage GROUP BY "guildId"
    ), favorite AS (
      SELECT DISTINCT ON ("guildId") "guildId", "command"
      FROM usage
      ORDER BY "guildId", uses DESC, "command"
    )
    SELECT p."guildId" AS "id", g."name", g."icon",
      p.uses::float8 AS "count",
      f."command" AS "topCommand",
      to_char(p.last, ${ISO_OUT}) AS "lastActiveAt"
    FROM per_guild p
    JOIN favorite f USING ("guildId")
    LEFT JOIN "Guild" g ON g."id" = p."guildId"
    ORDER BY p.uses DESC, p."guildId"
    LIMIT ${limit}`;
}

export interface MetricSampleInput {
  name: string;
  takenAt: Date;
  value: number;
}

/** Écrit des relevés ; un relevé déjà pris pour ce créneau est gardé tel quel. */
export async function recordMetricSamples(
  db: Pick<PrismaClient, 'metricSample'>,
  samples: readonly MetricSampleInput[],
): Promise<number> {
  if (samples.length === 0) return 0;
  const { count } = await db.metricSample.createMany({
    data: samples.filter((sample) => Number.isFinite(sample.value)),
    skipDuplicates: true,
  });
  return count;
}

export interface MetricSeriesRow {
  name: string;
  points: { at: string; value: number }[];
}

/**
 * Les courbes des relevés `names` depuis `since`, en moyenne par pas de `binMinutes`
 * (créneaux alignés sur minuit UTC). Chaque nom demandé a sa courbe, vide s'il n'a pas de relevé.
 */
export async function metricSeries(
  db: Pick<PrismaClient, '$queryRaw'>,
  names: readonly string[],
  since: Date,
  binMinutes: number,
): Promise<MetricSeriesRow[]> {
  if (names.length === 0) return [];
  const rows = await db.$queryRaw<{ name: string; at: string; value: number }[]>`
    SELECT "name", to_char(bin, ${ISO_OUT}) AS "at", avg("value")::float8 AS "value"
    FROM (
      SELECT "name", "value",
        date_bin(make_interval(mins => ${binMinutes}::int), "takenAt", TIMESTAMP '2000-01-01') AS bin
      FROM "MetricSample"
      WHERE "name" = ANY(${[...names]}::text[])
        AND "takenAt" >= ${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'
    ) AS binned
    GROUP BY "name", bin
    ORDER BY "name", bin`;
  const byName = new Map(names.map((name) => [name, [] as MetricSeriesRow['points']]));
  for (const row of rows) byName.get(row.name)?.push({ at: row.at, value: row.value });
  return [...byName].map(([name, points]) => ({ name, points }));
}

/**
 * Le dernier relevé du stockage (Postgres, Valkey, Garage) : tous les relevés du créneau le plus
 * récent, pris ensemble par la même tâche. Rien tant qu'aucun relevé n'a été pris.
 */
export async function latestStorageSamples(
  db: Pick<PrismaClient, '$queryRaw'>,
): Promise<{ takenAt: string | null; samples: { name: string; value: number }[] }> {
  const rows = await db.$queryRaw<{ name: string; value: number; takenAt: string }[]>`
    SELECT "name", "value", to_char("takenAt", ${ISO_OUT}) AS "takenAt"
    FROM "MetricSample"
    WHERE "takenAt" = (
      SELECT max("takenAt") FROM "MetricSample"
      WHERE "name" NOT LIKE 'bot.%' AND "name" NOT LIKE 'api.%'
    )
      AND "name" NOT LIKE 'bot.%' AND "name" NOT LIKE 'api.%'
    ORDER BY "name"`;
  return {
    takenAt: rows[0]?.takenAt ?? null,
    samples: rows.map(({ name, value }) => ({ name, value })),
  };
}

/** La taille de la base, et ses cinq plus grosses tables (index compris). */
export async function databaseStats(
  db: Pick<PrismaClient, '$queryRaw'>,
): Promise<{ bytes: number; tables: { name: string; bytes: number }[] }> {
  const [size] = await db.$queryRaw<{ bytes: number }[]>`
    SELECT pg_database_size(current_database())::float8 AS "bytes"`;
  const tables = await db.$queryRaw<{ name: string; bytes: number }[]>`
    SELECT relname AS "name", pg_total_relation_size(relid)::float8 AS "bytes"
    FROM pg_statio_user_tables
    WHERE relname <> '_prisma_migrations'
    ORDER BY "bytes" DESC, relname
    LIMIT 5`;
  return { bytes: size?.bytes ?? 0, tables };
}

/** Efface relevés et compteurs plus vieux que `before`. */
export async function purgeMetrics(
  db: Pick<PrismaClient, 'metricSample' | 'commandUsage'>,
  before: Date,
): Promise<{ samples: number; usage: number }> {
  const [samples, usage] = await Promise.all([
    db.metricSample.deleteMany({ where: { takenAt: { lt: before } } }),
    db.commandUsage.deleteMany({ where: { hour: { lt: before } } }),
  ]);
  return { samples: samples.count, usage: usage.count };
}
