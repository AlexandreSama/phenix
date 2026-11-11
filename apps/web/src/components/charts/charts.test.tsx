import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarList } from './bar-list';
import { LineChart, niceCeil } from './line-chart';

const format = (value: number) => `${value} u`;

function line(points: { at: number; value: number }[], empty = 'Rien') {
  return render(
    <LineChart
      label="Essai"
      series={[{ key: 'a', label: 'A', color: '#3987e5', points }]}
      domain={[0, 10_000]}
      gapMs={2000}
      formatValue={format}
      formatAxisTime={(ms) => `t${ms}`}
      formatPointTime={(ms) => `à ${ms}`}
      empty={empty}
    />,
  );
}

describe('niceCeil', () => {
  it('arrondit le haut de l’échelle à une valeur ronde', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(7.3)).toBe(10);
    expect(niceCeil(180)).toBe(200);
    expect(niceCeil(2300)).toBe(2500);
    expect(niceCeil(0.04)).toBe(0.05);
  });
});

describe('LineChart', () => {
  it('sans point, affiche l’état vide à la place du graphique', () => {
    line([], 'Pas encore de relevé');
    expect(screen.getByText('Pas encore de relevé')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('coupe la courbe là où il manque des relevés', () => {
    const { container } = line([
      { at: 0, value: 1 },
      { at: 1000, value: 2 },
      // Trou de 5 s : un nouveau tronçon, et un point isolé
      { at: 6000, value: 3 },
    ]);
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).toContain('h6');
  });

  it('suit le pointeur et le clavier, et range les valeurs dans un tableau', () => {
    line([
      { at: 0, value: 1 },
      { at: 5000, value: 2 },
      { at: 10_000, value: 3 },
    ]);
    const plot = screen.getByRole('img', { name: /Essai\. A : 3 u/ });

    fireEvent.keyDown(plot, { key: 'Home' });
    expect(plot.textContent).toContain('à 0');
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(plot.textContent).toContain('à 5000');
    fireEvent.keyDown(plot, { key: 'End' });
    expect(plot.textContent).toContain('3 u');
    fireEvent.pointerLeave(plot);
    expect(plot.textContent).toBe('');

    // Le pointeur au début du tracé (jsdom : boîte de 0 px, donc tout à gauche)
    fireEvent.pointerMove(plot, { clientX: 0 });
    expect(plot.textContent).toContain('à 0');

    const table = screen.getByRole('table', { name: 'Essai' });
    const rows = within(table).getAllByRole('row');
    // L'en-tête, puis du plus récent au plus ancien
    expect(rows).toHaveLength(4);
    expect(rows[1]?.textContent).toBe('à 100003 u');
  });
});

describe('BarList', () => {
  it('écrit chaque valeur, et donne le même contenu en tableau', () => {
    render(
      <BarList
        label="Buckets"
        columns={['Bucket', 'Volume']}
        color="gold"
        items={[
          { key: 'a', label: 'media', value: 10, display: '10 Ko', detail: '2 objets' },
          { key: 'b', label: 'vide', value: 0, display: '0 o' },
        ]}
        empty="Rien"
      />,
    );
    const table = screen.getByRole('table', { name: 'Buckets' });
    expect(within(table).getByText('10 Ko (2 objets)')).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: 'vide' })).toBeTruthy();
  });

  it('affiche l’état vide', () => {
    render(<BarList label="B" columns={['a', 'b']} color="gold" items={[]} empty="Aucun bucket" />);
    expect(screen.getByText('Aucun bucket')).toBeTruthy();
  });
});
