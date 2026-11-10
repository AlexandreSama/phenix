import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TD2_PLATFORM_LABELS, type Td2PlatformKey } from '@phenix/shared';
import {
  PLATFORM_SLUGS,
  TRACKER_GG_URL,
  TRACKER_STAT_KEYS,
} from '../modules/td2/stats/tracker-gg.js';

/**
 * Enregistre la vraie réponse de l'API pour un joueur, puis dit lesquelles des clés attendues
 * par le bot (TRACKER_STAT_KEYS) elle contient.
 *
 *   pnpm --filter @projet/bot td2:record PSN Agent47
 */
const [platformArg = '', ...nameParts] = process.argv.slice(2);
const platform = platformArg.toUpperCase() as Td2PlatformKey;
const playerName = nameParts.join(' ').trim();
if (!(platform in TD2_PLATFORM_LABELS) || !playerName) {
  console.error('Usage : pnpm --filter @projet/bot td2:record <UBI|PSN|XBL> <pseudo>');
  process.exit(1);
}
const apiKey = process.env.TRN_API_KEY;
if (!apiKey) {
  console.error('TRN_API_KEY est vide dans .env');
  process.exit(1);
}

const baseUrl = (process.env.TRN_API_URL || TRACKER_GG_URL).replace(/\/+$/, '');
const url = `${baseUrl}/division-2/standard/profile/${PLATFORM_SLUGS[platform]}/${encodeURIComponent(playerName)}`;
const response = await fetch(url, {
  headers: { 'TRN-Api-Key': apiKey, Accept: 'application/json' },
});
const body = await response.text();
if (!response.ok) {
  console.error(`L'API répond ${response.status} : ${body.slice(0, 300)}`);
  process.exit(1);
}

const json = JSON.parse(body) as {
  data?: {
    segments?: {
      type?: string;
      stats?: Record<string, { displayValue?: string; displayType?: string }>;
    }[];
  };
};
const file = new URL('../modules/td2/stats/fixtures/tracker-profile.real.json', import.meta.url);
writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
console.log(`Réponse enregistrée dans ${fileURLToPath(file)}\n`);

const segments = json.data?.segments ?? [];
const stats = (segments.find((segment) => segment.type === 'overview') ?? segments[0])?.stats ?? {};
for (const [ours, theirs] of Object.entries(TRACKER_STAT_KEYS)) {
  const stat = stats[theirs];
  console.log(
    stat
      ? `✓ ${ours} → ${theirs} : ${stat.displayValue} (${stat.displayType})`
      : `✗ ${ours} → ${theirs} : absente de la réponse`,
  );
}
console.log(`\nToutes les clés de la réponse : ${Object.keys(stats).join(', ')}`);
