import { describe, expect, it } from 'vitest';
import { DASHBOARD_MODULE_LABELS, DASHBOARD_MODULES } from '../constants.js';
import {
  renderWelcomeTemplate,
  WELCOME_DEFAULTS,
  WELCOME_LIMITS,
  WELCOME_VARIABLES,
  welcomeSettingsSchema,
  welcomeTemplateSchema,
} from './welcome.js';

const CHANNEL = '100000000000000001';
const ROLE = '100000000000000002';

const settings = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: null,
  welcomeRoleId: null,
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: null,
};

const values = { membre: '<@42>', pseudo: 'Alice', serveur: 'Phénix', effectif: 1234 };

const ALLOWED = 'Variables permises : {membre}, {pseudo}, {serveur}, {effectif}';

describe('onglet du tableau de bord', () => {
  it('l’onglet WELCOME s’appelle « Bienvenue »', () => {
    expect(DASHBOARD_MODULES).toContain('WELCOME');
    expect(DASHBOARD_MODULE_LABELS).toMatchObject({ WELCOME: 'Bienvenue' });
  });
});

describe('WELCOME_VARIABLES', () => {
  it('liste les quatre variables, en français', () => {
    expect(WELCOME_VARIABLES).toEqual(['membre', 'pseudo', 'serveur', 'effectif']);
  });
});

describe('welcomeTemplateSchema', () => {
  it('accepte les deux textes par défaut', () => {
    expect(welcomeTemplateSchema.parse(WELCOME_DEFAULTS.welcomeMessage)).toBe(
      WELCOME_DEFAULTS.welcomeMessage,
    );
    expect(welcomeTemplateSchema.parse(WELCOME_DEFAULTS.goodbyeMessage)).toBe(
      WELCOME_DEFAULTS.goodbyeMessage,
    );
  });

  it('retire les espaces autour ; vide ou absent = texte par défaut (null)', () => {
    expect(welcomeTemplateSchema.parse('  Salut {membre}  ')).toBe('Salut {membre}');
    expect(welcomeTemplateSchema.parse('   ')).toBeNull();
    expect(welcomeTemplateSchema.parse('')).toBeNull();
    expect(welcomeTemplateSchema.parse(null)).toBeNull();
  });

  it(`accepte ${WELCOME_LIMITS.messageMax} caractères, pas un de plus`, () => {
    expect(WELCOME_LIMITS.messageMax).toBe(1000);
    expect(welcomeTemplateSchema.safeParse('a'.repeat(1000)).success).toBe(true);
    expect(welcomeTemplateSchema.safeParse('a'.repeat(1001)).error?.issues[0]?.message).toBe(
      '1000 caractères au plus',
    );
  });

  it.each(['{inconnu}', '{MEMBRE}', '{nombre}', '{ membre }'])(
    'refuse %s en listant les variables permises',
    (variable) => {
      const message = welcomeTemplateSchema.safeParse(`Salut ${variable}`).error?.issues[0]
        ?.message;
      expect(message).toBe(`Variable inconnue : ${variable}. ${ALLOWED}`);
    },
  );

  it('accepte toutes les variables permises, et une accolade seule', () => {
    expect(
      welcomeTemplateSchema.safeParse('{membre} {pseudo} {serveur} {effectif} :-{').success,
    ).toBe(true);
  });

  it.each(['@everyone', '@here', '<@&100000000000000002>'])('refuse la mention %s', (mention) => {
    expect(welcomeTemplateSchema.safeParse(`Coucou ${mention}`).error?.issues[0]?.message).toBe(
      'Pas de mention @everyone, @here ni de rôle dans ce message',
    );
  });
});

describe('welcomeSettingsSchema', () => {
  it('accepte les réglages par défaut : tout désactivé', () => {
    expect(welcomeSettingsSchema.parse(settings)).toEqual(settings);
  });

  it('accepte des réglages complets', () => {
    const full = {
      welcomeEnabled: true,
      welcomeChannelId: CHANNEL,
      welcomeMessage: 'Bienvenue {membre} !',
      welcomeRoleId: ROLE,
      goodbyeEnabled: true,
      goodbyeChannelId: CHANNEL,
      goodbyeMessage: 'Au revoir {pseudo}.',
    };
    expect(welcomeSettingsSchema.parse(full)).toEqual(full);
  });

  it('refuse un ID Discord illisible', () => {
    for (const field of ['welcomeChannelId', 'welcomeRoleId', 'goodbyeChannelId']) {
      expect(
        welcomeSettingsSchema.safeParse({ ...settings, [field]: 'salon' }).error?.issues[0],
      ).toMatchObject({ path: [field], message: 'ID Discord invalide' });
    }
  });

  it('un message activé demande son salon', () => {
    expect(
      welcomeSettingsSchema.safeParse({ ...settings, welcomeEnabled: true }).error?.issues,
    ).toEqual([
      expect.objectContaining({
        path: ['welcomeChannelId'],
        message: 'Choisis le salon des messages d’arrivée',
      }),
    ]);
    expect(
      welcomeSettingsSchema.safeParse({ ...settings, goodbyeEnabled: true }).error?.issues,
    ).toEqual([
      expect.objectContaining({
        path: ['goodbyeChannelId'],
        message: 'Choisis le salon des messages de départ',
      }),
    ]);
  });

  it('vérifie aussi les messages', () => {
    expect(
      welcomeSettingsSchema.safeParse({ ...settings, goodbyeMessage: 'Bye @here' }).error?.issues[0]
        ?.path,
    ).toEqual(['goodbyeMessage']);
  });
});

describe('renderWelcomeTemplate', () => {
  it('remplace toutes les occurrences, effectif au format français', () => {
    expect(
      renderWelcomeTemplate(
        '{membre} / {pseudo} sur {serveur} ({effectif}) — {pseudo}',
        values,
        'welcome',
      ),
    ).toBe('<@42> / Alice sur Phénix (1 234) — Alice');
  });

  it('fait un seul passage : une valeur qui ressemble à une variable reste telle quelle', () => {
    expect(
      renderWelcomeTemplate(
        '{pseudo} sur {serveur}',
        { ...values, pseudo: '{serveur}' },
        'welcome',
      ),
    ).toBe('{serveur} sur Phénix');
  });

  it('n’interprète pas les motifs spéciaux de replace ($&, $1, $$)', () => {
    expect(
      renderWelcomeTemplate('Salut {pseudo}', { ...values, pseudo: '$& $1 $$' }, 'welcome'),
    ).toBe('Salut $& $1 $$');
  });

  it('laisse une variable inconnue telle quelle', () => {
    expect(renderWelcomeTemplate('{nombre} {MEMBRE}', values, 'welcome')).toBe('{nombre} {MEMBRE}');
  });

  // discord.js compte la description d'un embed en unités UTF-16 (`.length`) : un émoji en vaut deux
  it('coupe à 4096 unités UTF-16 après rendu, la limite de discord.js', () => {
    const long = renderWelcomeTemplate(
      '{pseudo}',
      { ...values, pseudo: '😀'.repeat(5000) },
      'welcome',
    );
    expect(long).toHaveLength(4096);
    expect(long).toBe('😀'.repeat(2048));
    expect(renderWelcomeTemplate('a'.repeat(5000), values, 'welcome')).toHaveLength(4096);
  });

  it('ne coupe jamais un émoji en deux (pas de demi-paire de substitution)', () => {
    const cut = renderWelcomeTemplate(
      'a{pseudo}',
      { ...values, pseudo: '😀'.repeat(3000) },
      'welcome',
    );
    expect(cut).toHaveLength(4095);
    expect(cut).toBe(`a${'😀'.repeat(2047)}`);
    expect(cut.isWellFormed()).toBe(true);
  });

  it('laisse un texte court intact', () => {
    expect(renderWelcomeTemplate('Salut {pseudo} 😀', values, 'welcome')).toBe('Salut Alice 😀');
  });

  it('sans gabarit, prend le texte par défaut de l’arrivée ou du départ', () => {
    expect(renderWelcomeTemplate(null, values, 'welcome')).toBe(
      renderWelcomeTemplate(WELCOME_DEFAULTS.welcomeMessage, values, 'welcome'),
    );
    expect(renderWelcomeTemplate(null, values, 'goodbye')).toBe(
      renderWelcomeTemplate(WELCOME_DEFAULTS.goodbyeMessage, values, 'goodbye'),
    );
    expect(renderWelcomeTemplate(null, values, 'welcome')).not.toBe(
      renderWelcomeTemplate(null, values, 'goodbye'),
    );
  });
});
