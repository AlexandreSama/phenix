import type { ReactNode } from 'react';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** La valeur écrite à droite de la barre : « 1,2 Go », « 340 » */
  display: string;
  /** Une précision sous le nom : « 2 erreurs · 120 ms » */
  detail?: string;
}

interface BarListProps {
  /** Le nom du graphique, et la légende de son tableau */
  label: string;
  /** Les en-têtes du tableau des lecteurs d'écran */
  columns: [string, string];
  items: BarItem[];
  color: string;
  empty: ReactNode;
}

/**
 * Des barres horizontales rangées de la plus grande à la plus petite, chacune avec sa valeur
 * écrite : lisibles sur un téléphone. Les lecteurs d'écran lisent le tableau équivalent.
 */
export function BarList({ label, columns, items, color, empty }: BarListProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-stone-400">
        {empty}
      </p>
    );
  }
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div>
      <ol aria-hidden="true" className="flex flex-col gap-3.5">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-stone-200">{item.label}</span>
                {item.detail && <span className="text-xs text-stone-500">{item.detail}</span>}
              </span>
              <span className="shrink-0 font-medium text-white tabular-nums">{item.display}</span>
            </div>
            <div className="h-2 rounded-full bg-white/6">
              <div
                className="h-full rounded-full"
                // Une valeur non nulle garde au moins un trait visible
                style={{
                  width: item.value > 0 ? `max(4px, ${(item.value / max) * 100}%)` : '0',
                  background: color,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{columns[0]}</th>
            <th scope="col">{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key}>
              <th scope="row">{item.label}</th>
              <td>
                {item.display}
                {item.detail && ` (${item.detail})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
