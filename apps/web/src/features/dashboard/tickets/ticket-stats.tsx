import { TICKET_RATING_MIN_COUNT, type TicketStats } from '@phenix/shared';
import { Panel } from '../../../components/ui/panel';

// Une décimale, toujours : l'API arrondit déjà, l'affichage n'ajoute jamais de précision
const average = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

interface Entry {
  name: string;
  average: number | null;
}

/**
 * La moyenne sur 5 et le seuil, ou seulement le motif quand il y a trop peu de notes. Jamais de
 * nombre de notes : comparé d'une visite à l'autre, il permettrait de retrouver une note.
 */
function Rating({ entry }: { entry: Entry }) {
  return entry.average === null ? (
    <span className="text-sm text-stone-400">
      Pas assez de notes (moins de {TICKET_RATING_MIN_COUNT})
    </span>
  ) : (
    <span className="text-sm tabular-nums">
      <span className="font-semibold text-white">{average.format(entry.average)} / 5</span>{' '}
      <span className="text-stone-500">(au moins {TICKET_RATING_MIN_COUNT} notes)</span>
    </span>
  );
}

function RatingList({ label, title, entries }: { label: string; title: string; entries: Entry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-stone-300">{title}</h4>
      <ul aria-label={label} className="flex flex-col divide-y divide-white/6">
        {entries.map((entry, index) => (
          // Clé = position dans la liste : jamais un identifiant Discord, même dans le DOM virtuel
          <li key={index} className="flex items-center justify-between gap-4 py-2">
            <span className="min-w-0 truncate text-white">{entry.name}</span>
            <Rating entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Les notes de satisfaction, en moyennes seulement. L'API masque toute moyenne de moins de
 * 5 notes (`average` null) et arrondit les autres au dixième. `members` n'est fourni qu'aux
 * administrateurs du serveur : sans lui, le bloc « par membre de l'équipe » n'apparaît pas.
 */
export function TicketStatsPanel({
  types,
  members = [],
}: {
  types: TicketStats['types'];
  members?: TicketStats['members'];
}) {
  const empty = types.length === 0 && members.length === 0;

  return (
    <Panel
      title="Satisfaction"
      icon="ticket"
      description="Indicatif : ne pas fonder de décision sur ces moyennes. Seules des moyennes sont visibles, jamais la note d’un ticket."
    >
      {empty ? (
        <p className="text-sm text-stone-400">Aucune note de satisfaction pour le moment</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <RatingList
            title="Par type"
            label="Moyennes par type"
            entries={types.map((row) => ({
              name: row.typeName ?? 'Type supprimé',
              average: row.average,
            }))}
          />
          <RatingList
            title="Par membre de l’équipe"
            label="Moyennes par membre de l’équipe"
            entries={members.map((row) => ({
              name: row.claimedByName ?? 'Membre inconnu',
              average: row.average,
            }))}
          />
        </div>
      )}
    </Panel>
  );
}
