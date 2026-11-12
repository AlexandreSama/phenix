import { DashboardModule } from '@phenix/database';
import { DASHBOARD_MODULES } from '@phenix/shared';
import { describe, expect, it } from 'vitest';

describe('onglets du tableau de bord', () => {
  it('la base et le code partagé connaissent les mêmes onglets', () => {
    expect(Object.values(DashboardModule).toSorted()).toEqual([...DASHBOARD_MODULES].toSorted());
  });
});
