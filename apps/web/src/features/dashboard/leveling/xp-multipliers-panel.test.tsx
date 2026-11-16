import {
  MAX_XP_MULTIPLIERS,
  type GuildCategorySummary,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type XpMultiplierEntry,
} from '@phenix/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { previewBonus } from './xp-bonus-preview';
import { XpMultipliersPanel } from './xp-multipliers-panel';

const ROLE = '500000000000000001';
const BOOSTER = '500000000000000002';
const TEXT = '400000000000000001';
const VOICE = '400000000000000002';
const FORUM = '400000000000000004';
const CATEGORY = '400000000000000003';
const DELETED = '400000000000000009';

const roles = [
  {
    id: ROLE,
    name: 'Modérateur',
    color: null,
    assignable: true,
    blockedReason: null,
    managed: false,
  },
  {
    id: BOOSTER,
    name: 'Booster',
    color: '#f47fff',
    assignable: false,
    blockedReason: 'Rôle géré par Discord',
    managed: true,
  },
] as GuildRoleSummary[];
const channels: GuildChannelSummary[] = [{ id: TEXT, name: 'niveaux', parentName: 'Discussion' }];
const voiceChannels: GuildChannelSummary[] = [{ id: VOICE, name: 'Salon vocal', parentName: null }];
const forumChannels: GuildChannelSummary[] = [{ id: FORUM, name: 'Idées', parentName: null }];
const categories: GuildCategorySummary[] = [{ id: CATEGORY, name: 'Support' }];
const config = { xpMin: 15, xpMax: 25, xpMultiplierMaxPercent: 300 };

function setup(
  multipliers: XpMultiplierEntry[] = [],
  onSubmit = vi.fn().mockResolvedValue(undefined),
  overrides: Partial<{ channels: GuildChannelSummary[]; config: typeof config }> = {},
) {
  render(
    <XpMultipliersPanel
      config={overrides.config ?? config}
      multipliers={multipliers}
      roles={roles}
      channels={overrides.channels ?? channels}
      voiceChannels={voiceChannels}
      forumChannels={forumChannels}
      categories={categories}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const manyChannels = (count: number): GuildChannelSummary[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(500000000000000100n + BigInt(i)),
    name: `salon-${i}`,
    parentName: null,
  }));

const previews = () =>
  within(screen.getByRole('region', { name: "Bonus d'XP" }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

const panel = () => screen.getByRole('region', { name: "Bonus d'XP" });
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Ajouter un bonus' }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les bonus' }));
const target = (n: number) =>
  screen.getByLabelText<HTMLSelectElement>(`Rôle, salon ou catégorie du bonus ${n}`);
const percent = (n: number) => screen.getByLabelText<HTMLInputElement>(`Pourcentage du bonus ${n}`);
const choose = (n: number, id: string) => fireEvent.change(target(n), { target: { value: id } });
const setPercent = (n: number, value: string) =>
  fireEvent.change(percent(n), { target: { value } });

describe('XpMultipliersPanel : liste', () => {
  it('porte les mots du glossaire et n’affiche aucune ligne au départ', () => {
    setup();

    expect(within(panel()).getByRole('heading', { name: "Bonus d'XP" })).toBeTruthy();
    expect(screen.queryByLabelText(/Rôle, salon ou catégorie du bonus/)).toBeNull();
    expect(screen.getByText(/aucun bonus/i)).toBeTruthy();
    expect(panel().textContent).not.toMatch(/cible|boost\b/i);
  });

  it('affiche les bonus enregistrés, avec leur cible et leur pourcentage', () => {
    setup([
      { kind: 'ROLE', targetId: ROLE, percent: 150 },
      { kind: 'CATEGORY', targetId: CATEGORY, percent: 50 },
    ]);

    expect(target(1).value).toBe(ROLE);
    expect(percent(1).value).toBe('150');
    expect(target(2).value).toBe(CATEGORY);
    expect(percent(2).value).toBe('50');
  });

  it('regroupe les choix : rôles, salons textuels, vocaux, forums et médias, catégories', () => {
    setup();
    add();

    const select = target(1);
    const labels = Array.from(select.querySelectorAll('optgroup')).map((group) => group.label);
    expect(labels).toEqual([
      'Rôles',
      'Salons textuels',
      'Salons vocaux',
      'Forums et médias',
      'Catégories',
    ]);
  });

  it('propose les rôles gérés avec la mention « (géré) »', () => {
    setup();
    add();

    expect(within(target(1)).getByRole('option', { name: 'Booster (géré)' })).toBeTruthy();
    expect(within(target(1)).getByRole('option', { name: 'Modérateur' })).toBeTruthy();
    const managed = within(target(1)).getByRole('option', {
      name: 'Booster (géré)',
    }) as HTMLOptionElement;
    expect(managed.disabled).toBe(false);
  });

  it('ajoute puis supprime une ligne', () => {
    setup();
    add();
    add();
    expect(screen.getAllByLabelText(/Rôle, salon ou catégorie du bonus/).length).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le bonus 1' }));
    expect(screen.getAllByLabelText(/Rôle, salon ou catégorie du bonus/).length).toBe(1);
  });

  it('ne propose plus une cible déjà choisie dans les autres lignes', () => {
    setup([{ kind: 'ROLE', targetId: ROLE, percent: 150 }]);
    add();

    expect(within(target(2)).queryByRole('option', { name: 'Modérateur' })).toBeNull();
    expect(within(target(1)).getByRole('option', { name: 'Modérateur' })).toBeTruthy();
    expect(within(target(2)).getByRole('option', { name: 'Booster (géré)' })).toBeTruthy();
  });
});

describe('XpMultipliersPanel : enregistrement', () => {
  it('envoie le genre déduit de la cible : rôle, salon (texte, vocal, forum) ou catégorie', async () => {
    const onSubmit = setup();

    const ids = [BOOSTER, TEXT, VOICE, FORUM, CATEGORY];
    ids.forEach(() => add());
    ids.forEach((id, index) => choose(index + 1, id));
    setPercent(1, '200');
    save();

    expect(await screen.findByText(/Bonus enregistrés/)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith([
      { kind: 'ROLE', targetId: BOOSTER, percent: 200 },
      { kind: 'CHANNEL', targetId: TEXT, percent: 150 },
      { kind: 'CHANNEL', targetId: VOICE, percent: 150 },
      { kind: 'CHANNEL', targetId: FORUM, percent: 150 },
      { kind: 'CATEGORY', targetId: CATEGORY, percent: 150 },
    ]);
  });

  it('envoie la liste vide quand on retire le dernier bonus', async () => {
    const onSubmit = setup([{ kind: 'ROLE', targetId: ROLE, percent: 150 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le bonus 1' }));
    save();

    expect(await screen.findByText(/Bonus enregistrés/)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith([]);
  });

  it('garde le bouton d’enregistrement grisé tant que rien n’a changé', () => {
    setup([{ kind: 'ROLE', targetId: ROLE, percent: 150 }]);
    const button = screen.getByRole('button', { name: 'Enregistrer les bonus' });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    setPercent(1, '160');
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuse une ligne sans cible, sans appeler l’API', async () => {
    const onSubmit = setup();
    add();
    save();

    expect((await within(panel()).findByRole('alert')).textContent).toBe(
      'Choisis un rôle, un salon ou une catégorie',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['9', '10 % au moins'],
    ['501', '500 % au plus'],
    ['12.5', 'Nombre entier attendu'],
    ['', 'Entre un nombre'],
  ])('refuse le pourcentage « %s » : %s', async (value, message) => {
    const onSubmit = setup([{ kind: 'ROLE', targetId: ROLE, percent: 150 }]);

    setPercent(1, value);
    save();

    expect((await within(panel()).findByRole('alert')).textContent).toBe(message);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepte les bornes 10 % et 500 %', async () => {
    const onSubmit = setup([
      { kind: 'ROLE', targetId: ROLE, percent: 150 },
      { kind: 'CATEGORY', targetId: CATEGORY, percent: 150 },
    ]);

    setPercent(1, '10');
    setPercent(2, '500');
    save();

    expect(await screen.findByText(/Bonus enregistrés/)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith([
      { kind: 'ROLE', targetId: ROLE, percent: 10 },
      { kind: 'CATEGORY', targetId: CATEGORY, percent: 500 },
    ]);
  });

  it('affiche le message du serveur sans perdre la saisie', async () => {
    setup(
      [{ kind: 'ROLE', targetId: ROLE, percent: 150 }],
      vi.fn().mockRejectedValue(new Error('Rôle inconnu sur ce serveur')),
    );

    setPercent(1, '180');
    save();

    expect((await within(panel()).findByRole('alert')).textContent).toBe(
      'Rôle inconnu sur ce serveur',
    );
    expect(percent(1).value).toBe('180');
  });

  it('désactive le bouton et annonce l’enregistrement pendant l’envoi', async () => {
    const pending = Promise.withResolvers<void>();
    setup(
      [{ kind: 'ROLE', targetId: ROLE, percent: 150 }],
      vi.fn(() => pending.promise),
    );

    setPercent(1, '180');
    save();

    const button = (await screen.findByRole('button', {
      name: 'Enregistrement…',
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    pending.resolve();
    expect(await screen.findByText(/Bonus enregistrés/)).toBeTruthy();
  });
});

describe('XpMultipliersPanel : limite et cibles supprimées', () => {
  it('garde un conteneur d’état vide dans le DOM tant que la limite n’est pas atteinte', () => {
    setup();

    expect(within(panel()).getByRole('status').textContent).toBe('');
  });

  it('bloque le cinquante et unième bonus avec un message clair', () => {
    const list = manyChannels(MAX_XP_MULTIPLIERS);
    setup(
      list.map((channel) => ({ kind: 'CHANNEL' as const, targetId: channel.id, percent: 150 })),
      undefined,
      { channels: list },
    );

    // La valeur 50 reste écrite en dur ici : c'est ce que lit l'administrateur
    expect(MAX_XP_MULTIPLIERS).toBe(50);
    expect(within(panel()).getByRole('status').textContent).toMatch(/50 bonus au plus/);
    expect(
      (screen.getByRole('button', { name: 'Ajouter un bonus' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    // Retirer un bonus libère la place, et le conteneur d'état se vide sans disparaître
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le bonus 1' }));
    expect(
      (screen.getByRole('button', { name: 'Ajouter un bonus' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(within(panel()).getByRole('status').textContent).toBe('');
  });

  it.each([
    ['ROLE', 'Rôle supprimé'],
    ['CHANNEL', 'Salon supprimé'],
    ['CATEGORY', 'Catégorie supprimée'],
  ] as const)(
    'affiche une cible %s disparue « %s » avec son identifiant, retirable',
    async (kind, label) => {
      const onSubmit = setup([{ kind, targetId: DELETED, percent: 150 }]);

      const select = target(1);
      expect(select.value).toBe(DELETED);
      const option = within(select).getByRole('option', { name: new RegExp(label) });
      expect(option.textContent).toContain(DELETED);
      expect(
        screen.getByText("Cet élément n'existe plus sur le serveur : retire ce bonus."),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Supprimer le bonus 1' }));
      save();

      expect(await screen.findByText(/Bonus enregistrés/)).toBeTruthy();
      expect(onSubmit).toHaveBeenCalledWith([]);
    },
  );

  it('garde la cible supprimée dans l’envoi tant qu’on ne la retire pas', async () => {
    const onSubmit = setup([{ kind: 'CATEGORY', targetId: DELETED, percent: 150 }]);

    add();
    choose(2, ROLE);
    save();

    expect(await screen.findByText(/Bonus enregistrés/)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith([
      { kind: 'CATEGORY', targetId: DELETED, percent: 150 },
      { kind: 'ROLE', targetId: ROLE, percent: 150 },
    ]);
  });
});

describe('XpMultipliersPanel : aperçu', () => {
  it('calcule l’XP d’un bonus seul avec les mêmes règles que le bot', () => {
    setup([{ kind: 'ROLE', targetId: BOOSTER, percent: 150 }]);

    // 15 × 1,5 = 22,5 → 23 ; 25 × 1,5 = 37,5 → 38 (arrondi au plus proche, moitié vers le haut)
    expect(previews()).toEqual(['Booster : 15–25 XP → 23–38 XP']);
  });

  it('écrit un salon avec « # » et suit un pourcentage inférieur à 100 %', () => {
    setup([{ kind: 'CHANNEL', targetId: TEXT, percent: 50 }]);

    // 7,5 → 8 ; 12,5 → 13
    expect(previews()).toEqual(['#niveaux : 15–25 XP → 8–13 XP']);
  });

  it('dit quand le plafond des bonus limite le résultat', () => {
    setup([{ kind: 'CATEGORY', targetId: CATEGORY, percent: 500 }]);

    expect(previews()).toEqual([
      'Support : 15–25 XP → 45–75 XP (limité par le plafond des bonus, 300 %)',
    ]);
  });

  it('ne mentionne pas le plafond quand le bonus le respecte exactement', () => {
    setup([{ kind: 'CATEGORY', targetId: CATEGORY, percent: 300 }]);

    expect(previews()).toEqual(['Support : 15–25 XP → 45–75 XP']);
  });

  it('ne donne qu’un nombre quand le minimum égale le maximum', () => {
    setup([{ kind: 'ROLE', targetId: ROLE, percent: 200 }], undefined, {
      config: { xpMin: 20, xpMax: 20, xpMultiplierMaxPercent: 300 },
    });

    expect(previews()).toEqual(['Modérateur : 20 XP → 40 XP']);
  });

  it('suit la saisie en direct et saute les lignes incomplètes ou supprimées', () => {
    setup([{ kind: 'ROLE', targetId: ROLE, percent: 150 }]);
    add();
    expect(previews().length).toBe(1);

    setPercent(1, '200');
    expect(previews()).toEqual(['Modérateur : 15–25 XP → 30–50 XP']);

    setPercent(1, '');
    expect(screen.queryAllByRole('listitem').length).toBe(0);
  });
});

describe('previewBonus', () => {
  it('applique effectiveXp à xpMin et xpMax', () => {
    expect(
      previewBonus({ kind: 'ROLE', targetId: ROLE, percent: 150 }, { xpMin: 15, xpMax: 25 }, 300),
    ).toEqual({ min: 23, max: 38, limited: false });
  });

  it('signale un résultat borné par le plafond', () => {
    expect(
      previewBonus({ kind: 'ROLE', targetId: ROLE, percent: 400 }, { xpMin: 10, xpMax: 20 }, 200),
    ).toEqual({ min: 20, max: 40, limited: true });
  });
});
