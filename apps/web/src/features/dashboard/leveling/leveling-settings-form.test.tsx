import {
  MAX_XP_EXCLUDED_CHANNELS,
  type GuildCategorySummary,
  type GuildChannelSummary,
  type LevelingConfig,
} from '@phenix/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatMinutes, toFormValues, unknownChannelIds } from './form-values';
import { LevelingSettingsForm } from './leveling-settings-form';

const TEXT = '400000000000000001';
const VOICE = '400000000000000002';
const CATEGORY = '400000000000000003';
const FORUM = '400000000000000004';
const DELETED = '400000000000000009';

const config: LevelingConfig = {
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
  xpExcludedChannelIds: [],
  xpMultiplierMaxPercent: 300,
};
const channels: GuildChannelSummary[] = [{ id: TEXT, name: 'niveaux', parentName: 'Discussion' }];
const voiceChannels: GuildChannelSummary[] = [{ id: VOICE, name: 'Salon vocal', parentName: null }];
const forumChannels: GuildChannelSummary[] = [
  { id: FORUM, name: 'Idées', parentName: 'Discussion' },
];
const categories: GuildCategorySummary[] = [{ id: CATEGORY, name: 'Support' }];

function setup(
  onSubmit = vi.fn().mockResolvedValue(undefined),
  overrides: Partial<{
    config: LevelingConfig;
    channels: GuildChannelSummary[];
    voiceChannels: GuildChannelSummary[];
    forumChannels: GuildChannelSummary[];
    categories: GuildCategorySummary[];
  }> = {},
) {
  render(
    <LevelingSettingsForm
      guildId="300000000000000001"
      config={overrides.config ?? config}
      channels={overrides.channels ?? channels}
      voiceChannels={overrides.voiceChannels ?? voiceChannels}
      forumChannels={overrides.forumChannels ?? forumChannels}
      categories={overrides.categories ?? categories}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const excludedGroup = () => screen.getByRole('group', { name: "Salons exclus de l'XP" });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LevelingSettingsForm', () => {
  it('envoie des nombres, et null pour « dans le salon du membre »', async () => {
    const onSubmit = setup();

    type('XP maximum par message', '40');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({ ...config, xpMax: 40 });
  });

  it('refuse un minimum supérieur au maximum sans appeler l’API', async () => {
    const onSubmit = setup();

    type('XP minimum par message', '30');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Le minimum d'XP doit être inférieur ou égal au maximum",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('met à jour l’estimation pendant la saisie', () => {
    setup();
    // Niveau 10 = 4 675 XP ; 20 XP en moyenne → 234 messages, une minute chacun
    expect(screen.getByText(/234 messages/)).toBeTruthy();
    expect(screen.getByText(/3 h 54 min/)).toBeTruthy();

    type('XP minimum par message', '25');
    type('XP maximum par message', '35');

    expect(screen.getByText(/156 messages/)).toBeTruthy();
  });

  it('propose le lien du classement public seulement s’il est public', () => {
    setup();
    expect(screen.getByRole('link', { name: /classement public/ }).getAttribute('href')).toBe(
      '/classement/300000000000000001',
    );

    fireEvent.click(screen.getByLabelText(/Classement public sur le site/));
    expect(screen.queryByRole('link', { name: /classement public/ })).toBeNull();
  });
});

describe('LevelingSettingsForm : salons exclus de l’XP', () => {
  it('porte le libellé du glossaire, vide par défaut, et explique la portée', () => {
    setup();
    const group = excludedGroup();

    expect(within(group).getAllByRole('checkbox').length).toBe(4);
    for (const box of within(group).getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.getByText(/catégorie exclue couvre tous ses salons/i)).toBeTruthy();
    expect(screen.getByText(/fils de discussion/i)).toBeTruthy();
    expect(
      screen.getByText(/un forum ou un salon média couvre les messages de ses posts/i),
    ).toBeTruthy();
  });

  it('regroupe les salons textuels, vocaux, les forums et médias, et les catégories', () => {
    setup();

    const texts = within(excludedGroup()).getByRole('group', { name: 'Salons textuels' });
    const voices = within(excludedGroup()).getByRole('group', { name: 'Salons vocaux' });
    const forums = within(excludedGroup()).getByRole('group', { name: 'Forums et médias' });
    const cats = within(excludedGroup()).getByRole('group', { name: 'Catégories' });
    expect(within(texts).getByRole('checkbox', { name: /niveaux/ })).toBeTruthy();
    expect(within(voices).getByRole('checkbox', { name: /Salon vocal/ })).toBeTruthy();
    expect(within(forums).getByRole('checkbox', { name: /Idées/ })).toBeTruthy();
    expect(within(cats).getByRole('checkbox', { name: /Support/ })).toBeTruthy();
  });

  it('envoie les identifiants des salons choisis, de toutes les sources', async () => {
    const onSubmit = setup();

    fireEvent.click(screen.getByRole('checkbox', { name: /niveaux/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Salon vocal/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Idées/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Support/ }));
    save();

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({
      ...config,
      xpExcludedChannelIds: [TEXT, VOICE, FORUM, CATEGORY],
    });
  });

  it('coche les salons déjà exclus et permet de les retirer', async () => {
    const onSubmit = setup(undefined, {
      config: { ...config, xpExcludedChannelIds: [TEXT, CATEGORY] },
    });

    expect((screen.getByRole('checkbox', { name: /niveaux/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /niveaux/ }));
    save();

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({ ...config, xpExcludedChannelIds: [CATEGORY] });
  });

  it('affiche un salon supprimé et le laisse retirer', async () => {
    const onSubmit = setup(undefined, {
      config: { ...config, xpExcludedChannelIds: [DELETED] },
    });

    expect(screen.getByText('Salon supprimé')).toBeTruthy();
    const box = screen.getByRole('checkbox', { name: /Salon supprimé/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);

    fireEvent.click(box);
    save();

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({ ...config, xpExcludedChannelIds: [] });
  });

  it('garde un salon supprimé tant qu’on ne le retire pas', async () => {
    const onSubmit = setup(undefined, {
      config: { ...config, xpExcludedChannelIds: [DELETED] },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Support/ }));
    save();

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({
      ...config,
      xpExcludedChannelIds: [CATEGORY, DELETED],
    });
  });

  it('garde un conteneur d’état vide dans le DOM tant que la limite n’est pas atteinte', () => {
    setup();

    const status = within(excludedGroup()).getByRole('status');
    expect(status.textContent).toBe('');
  });

  it('bloque le cinquante et unième salon avec un message clair', () => {
    const many = Array.from({ length: MAX_XP_EXCLUDED_CHANNELS + 1 }, (_, i) => ({
      id: String(500000000000000000n + BigInt(i)),
      name: `salon-${i}`,
      parentName: null,
    }));
    setup(undefined, {
      channels: many,
      config: {
        ...config,
        xpExcludedChannelIds: many.slice(0, MAX_XP_EXCLUDED_CHANNELS).map((c) => c.id),
      },
    });

    // La valeur 50 reste écrite en dur ici : c'est ce que lit l'administrateur
    expect(MAX_XP_EXCLUDED_CHANNELS).toBe(50);
    expect(within(excludedGroup()).getByRole('status').textContent).toMatch(/50 salons au plus/);
    expect((screen.getByRole('checkbox', { name: /salon-50/ }) as HTMLInputElement).disabled).toBe(
      true,
    );

    // Retirer un salon libère la place, et le conteneur d'état se vide sans disparaître
    fireEvent.click(screen.getByRole('checkbox', { name: /salon-0$/ }));
    expect((screen.getByRole('checkbox', { name: /salon-50/ }) as HTMLInputElement).disabled).toBe(
      false,
    );
    expect(within(excludedGroup()).getByRole('status').textContent).toBe('');
  });
});

describe('LevelingSettingsForm : plafond des bonus', () => {
  it('porte le libellé du glossaire, la valeur de la config et son aide', () => {
    setup();

    const field = screen.getByLabelText<HTMLInputElement>('Plafond des bonus');
    expect(field.value).toBe('300');
    expect(field.type).toBe('number');
    expect(field.min).toBe('100');
    expect(field.max).toBe('1000');
    expect(screen.getByText(/le total des bonus ne dépasse jamais ce plafond/i)).toBeTruthy();
  });

  it('envoie le plafond avec les autres champs', async () => {
    const onSubmit = setup();

    type('Plafond des bonus', '450');
    save();

    expect(await screen.findByText('Enregistré. Le bot applique déjà le changement.')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({ ...config, xpMultiplierMaxPercent: 450 });
  });

  it.each([
    ['99', '100 % au moins'],
    ['1001', '1000 % au plus'],
    ['150.5', 'Nombre entier attendu'],
  ])('refuse le plafond « %s » : %s', async (value, message) => {
    const onSubmit = setup();

    type('Plafond des bonus', value);
    save();

    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('form-values : salons exclus', () => {
  it('part de la liste de la config', () => {
    expect(toFormValues({ ...config, xpExcludedChannelIds: [TEXT] }).xpExcludedChannelIds).toEqual([
      TEXT,
    ]);
  });

  it('repère les identifiants que Discord ne connaît plus', () => {
    expect(unknownChannelIds([TEXT, DELETED], [TEXT, VOICE])).toEqual([DELETED]);
    expect(unknownChannelIds([], [TEXT])).toEqual([]);
  });
});

describe('formatMinutes', () => {
  it('écrit une durée lisible', () => {
    expect(formatMinutes(0)).toBe("moins d'une minute");
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(234)).toBe('3 h 54 min');
  });
});
