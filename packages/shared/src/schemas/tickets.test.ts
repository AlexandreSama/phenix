import { describe, expect, it } from 'vitest';
import {
  maskRatingStats,
  ticketListQuerySchema,
  ticketQuestionSchema,
  ticketRatingSchema,
  ticketSettingsSchema,
  ticketTypeSchema,
  TICKET_INACTIVITY_CHOICES,
  TICKET_RATING_MIN_COUNT,
  TICKET_RATING_WINDOW_DAYS,
} from './tickets.js';

const valid = {
  logChannelId: null,
  panel: {
    channelId: '300000000000000001',
    title: 'Besoin d’aide ?',
    description: null,
    buttonLabel: 'Ouvrir un ticket',
  },
};

describe('ticketSettingsSchema', () => {
  it('accepte des réglages valides', () => {
    expect(ticketSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it('ne porte plus ni catégorie ni rôles : ils sont réglés par type', () => {
    const parsed = ticketSettingsSchema.parse({
      ...valid,
      categoryId: '100000000000000001',
      staffRoleIds: ['200000000000000001'],
    });
    expect(parsed).not.toHaveProperty('categoryId');
    expect(parsed).not.toHaveProperty('staffRoleIds');
  });

  it('refuse un bouton sans texte', () => {
    const panel = { ...valid.panel, buttonLabel: '   ' };
    expect(ticketSettingsSchema.safeParse({ ...valid, panel }).success).toBe(false);
  });
});

const question = {
  label: 'Quel est ton problème ?',
  placeholder: null,
  style: 'PARAGRAPH' as const,
  required: true,
  maxLength: 1000,
};

const validType = {
  name: 'Support',
  description: null,
  emoji: '🎫',
  categoryId: '100000000000000001',
  staffRoleIds: ['200000000000000001'],
  inactivityHours: null,
  questions: [question],
};

describe('ticketTypeSchema', () => {
  it('accepte un type valide, avec ou sans question', () => {
    expect(ticketTypeSchema.safeParse(validType).success).toBe(true);
    expect(ticketTypeSchema.safeParse({ ...validType, questions: [] }).success).toBe(true);
  });

  it('exige un nom de 80 caractères au plus', () => {
    const empty = ticketTypeSchema.safeParse({ ...validType, name: '   ' });
    expect(empty.error?.issues[0]?.message).toBe('Le nom est obligatoire');
    const long = ticketTypeSchema.safeParse({ ...validType, name: 'a'.repeat(81) });
    expect(long.error?.issues[0]?.message).toBe('80 caractères au plus');
    expect(ticketTypeSchema.safeParse({ ...validType, name: 'a'.repeat(80) }).success).toBe(true);
  });

  it('limite la description à 100 caractères (la limite de Discord pour un menu)', () => {
    expect(ticketTypeSchema.safeParse({ ...validType, description: 'a'.repeat(100) }).success).toBe(
      true,
    );
    const long = ticketTypeSchema.safeParse({ ...validType, description: 'a'.repeat(101) });
    expect(long.error?.issues[0]?.message).toBe('100 caractères au plus');
  });

  it('accepte un emoji ou rien, mais pas du texte', () => {
    expect(ticketTypeSchema.safeParse({ ...validType, emoji: null }).success).toBe(true);
    expect(ticketTypeSchema.safeParse({ ...validType, emoji: 'abc' }).success).toBe(false);
  });

  it('dit en clair qu’une catégorie manque, au lieu de « ID Discord invalide »', () => {
    const empty = ticketTypeSchema.safeParse({ ...validType, categoryId: '' });
    expect(empty.error?.issues[0]?.message).toBe('Choisis une catégorie');

    const malformed = ticketTypeSchema.safeParse({ ...validType, categoryId: 'abc' });
    expect(malformed.error?.issues[0]?.message).toBe('ID Discord invalide');
  });

  it('exige de 1 à 10 rôles', () => {
    const none = ticketTypeSchema.safeParse({ ...validType, staffRoleIds: [] });
    expect(none.error?.issues[0]?.message).toContain('personne ne verrait les tickets');

    const ids = Array.from({ length: 11 }, (_, i) => `20000000000000000${i % 10}`);
    expect(
      ticketTypeSchema.safeParse({ ...validType, staffRoleIds: ids.slice(0, 10) }).success,
    ).toBe(true);
    const many = ticketTypeSchema.safeParse({ ...validType, staffRoleIds: ids });
    expect(many.error?.issues[0]?.message).toBe('10 rôles au plus');
  });

  it('accepte 5 questions au plus : la limite d’un formulaire Discord', () => {
    const five = Array.from({ length: 5 }, () => question);
    expect(ticketTypeSchema.safeParse({ ...validType, questions: five }).success).toBe(true);
    const six = ticketTypeSchema.safeParse({ ...validType, questions: [...five, question] });
    expect(six.error?.issues[0]?.message).toBe(
      '5 questions au plus : la limite d’un formulaire Discord',
    );
  });
});

describe('délai d’inactivité', () => {
  it('propose 12 h, 24 h, 48 h, 72 h et 7 jours', () => {
    expect(TICKET_INACTIVITY_CHOICES).toEqual([12, 24, 48, 72, 168]);
  });

  it.each([null, 12, 24, 48, 72, 168])('accepte %s', (inactivityHours) => {
    expect(ticketTypeSchema.safeParse({ ...validType, inactivityHours }).success).toBe(true);
  });

  it.each([0, 1, 13, 169, -24, 24.5, '24', Number.NaN])(
    'refuse %s, en français',
    (inactivityHours) => {
      const result = ticketTypeSchema.safeParse({ ...validType, inactivityHours });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'Choisis un délai proposé, ou désactive la fermeture automatique',
      );
    },
  );

  it('doit être renseigné (null pour désactiver) : jamais de fermeture par oubli', () => {
    const { inactivityHours: _unused, ...withoutDelay } = validType;
    expect(ticketTypeSchema.safeParse(withoutDelay).success).toBe(false);
  });
});

describe('ticketQuestionSchema', () => {
  it('exige un libellé de 45 caractères au plus', () => {
    const empty = ticketQuestionSchema.safeParse({ ...question, label: ' ' });
    expect(empty.error?.issues[0]?.message).toBe('La question est obligatoire');
    const long = ticketQuestionSchema.safeParse({ ...question, label: 'a'.repeat(46) });
    expect(long.error?.issues[0]?.message).toBe('45 caractères au plus');
    expect(ticketQuestionSchema.safeParse({ ...question, label: 'a'.repeat(45) }).success).toBe(
      true,
    );
  });

  it('limite l’aide à 100 caractères', () => {
    expect(
      ticketQuestionSchema.safeParse({ ...question, placeholder: 'a'.repeat(100) }).success,
    ).toBe(true);
    const long = ticketQuestionSchema.safeParse({ ...question, placeholder: 'a'.repeat(101) });
    expect(long.error?.issues[0]?.message).toBe('100 caractères au plus');
  });

  it('accepte les styles SHORT et PARAGRAPH, rien d’autre', () => {
    expect(ticketQuestionSchema.safeParse({ ...question, style: 'SHORT' }).success).toBe(true);
    expect(ticketQuestionSchema.safeParse({ ...question, style: 'LONG' }).success).toBe(false);
  });

  it('borne la longueur de la réponse entre 1 et 1000 (entier)', () => {
    for (const maxLength of [1, 1000]) {
      expect(ticketQuestionSchema.safeParse({ ...question, maxLength }).success).toBe(true);
    }
    for (const maxLength of [0, 1001, 10.5]) {
      const result = ticketQuestionSchema.safeParse({ ...question, maxLength });
      expect(result.error?.issues[0]?.message).toBe('Longueur de réponse invalide (1 à 1000)');
    }
  });
});

describe('ticketListQuerySchema', () => {
  it('montre les tickets ouverts, page 1, par défaut', () => {
    expect(ticketListQuerySchema.parse({})).toEqual({ status: 'open', page: 1 });
    expect(ticketListQuerySchema.safeParse({ status: 'tous' }).success).toBe(false);
  });
});

describe('ticketRatingSchema', () => {
  it.each([1, 2, 3, 4, 5])('accepte la note %i', (note) => {
    expect(ticketRatingSchema.safeParse(note).success).toBe(true);
  });

  it.each([
    0,
    6,
    -1,
    2.5,
    '3',
    null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    5.000_000_1,
    0.9999,
  ])('refuse %s, en français', (note) => {
    const result = ticketRatingSchema.safeParse(note);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/note/i);
  });
});

describe('constantes de la note', () => {
  it('fixent la fenêtre à 7 jours et le seuil d’une moyenne à 5 notes', () => {
    expect(TICKET_RATING_WINDOW_DAYS).toBe(7);
    expect(TICKET_RATING_MIN_COUNT).toBe(5);
  });
});

/** La moyenne publique d'un type dont la base a compté `count` notes de moyenne `average`. */
const typeAverage = (count: number, average: number | null) =>
  maskRatingStats({ types: [{ typeId: 1, typeName: 'Aide', count, average }], members: [] })
    .types[0]?.average;

describe('maskRatingStats', () => {
  it('masque la moyenne sous 5 notes (4 → null), la donne à partir de 5', () => {
    expect(typeAverage(4, 4.5)).toBeNull();
    expect(typeAverage(5, 4.6)).toBe(4.6);
    expect(typeAverage(0, null)).toBeNull();
  });

  it('applique le même seuil aux membres de l’équipe', () => {
    const masked = maskRatingStats({
      types: [],
      members: [
        { claimedById: '9', claimedByName: 'Modo', count: 4, average: 5 },
        { claimedById: '8', claimedByName: null, count: 10, average: 3.2 },
      ],
    });

    expect(masked.members).toEqual([
      { claimedByName: 'Modo', average: null },
      { claimedByName: null, average: 3.2 },
    ]);
  });

  it('arrondit au dixième le plus proche, la moitié vers le haut', () => {
    expect(typeAverage(6, 4.333_333)).toBe(4.3);
    expect(typeAverage(8, 4.25)).toBe(4.3);
    // 4,35 ne s'écrit pas exactement en binaire (4,3499…) : arrondi quand même à 4,4
    expect(typeAverage(20, 4.35)).toBe(4.4);
    expect(typeAverage(6, 4.666_667)).toBe(4.7);
    expect(typeAverage(5, 5)).toBe(5);
  });

  it('garde null une moyenne déjà absente, même au-delà du seuil', () => {
    expect(typeAverage(7, null)).toBeNull();
  });

  it('ne renvoie ni nombre de notes ni identifiant Discord', () => {
    const masked = maskRatingStats({
      types: [{ typeId: null, typeName: null, count: 9, average: 4 }],
      members: [{ claimedById: '9', claimedByName: 'Modo', count: 9, average: 4 }],
    });

    expect(masked).toEqual({
      types: [{ typeId: null, typeName: null, average: 4 }],
      members: [{ claimedByName: 'Modo', average: 4 }],
    });
    expect(JSON.stringify(masked)).not.toMatch(/count|claimedById/);
  });

  it('trie les types par nom puis par id, jamais par nombre de notes', () => {
    // L'ordre par nombre de notes trahirait l'arrivée d'une nouvelle note
    const masked = maskRatingStats({
      types: [
        { typeId: 4, typeName: 'Signalement', count: 50, average: 4 },
        { typeId: 9, typeName: 'Aide', count: 8, average: 4 },
        { typeId: 2, typeName: 'Aide', count: 6, average: 4 },
      ],
      members: [],
    });

    expect(masked.types.map((row) => row.typeId)).toEqual([2, 9, 4]);
  });

  it('met à la fin un type ou un membre sans nom', () => {
    const masked = maskRatingStats({
      types: [
        { typeId: null, typeName: null, count: 9, average: 4 },
        { typeId: 5, typeName: 'Aide', count: 1, average: null },
      ],
      members: [
        { claimedById: '1', claimedByName: null, count: 9, average: 4 },
        { claimedById: '2', claimedByName: 'Modo', count: 9, average: 3 },
      ],
    });

    expect(masked.types.map((row) => row.typeName)).toEqual(['Aide', null]);
    expect(masked.members.map((row) => row.claimedByName)).toEqual(['Modo', null]);
  });

  it('trie les membres par pseudo, à pseudo égal dans l’ordre reçu', () => {
    const masked = maskRatingStats({
      types: [],
      members: [
        { claimedById: '1', claimedByName: 'Zoé', count: 40, average: 5 },
        { claimedById: '2', claimedByName: 'Modo', count: 9, average: 3 },
        { claimedById: '3', claimedByName: 'Modo', count: 20, average: 4 },
      ],
    });

    expect(masked.members).toEqual([
      { claimedByName: 'Modo', average: 3 },
      { claimedByName: 'Modo', average: 4 },
      { claimedByName: 'Zoé', average: 5 },
    ]);
  });

  it('ne modifie pas son entrée', () => {
    const raw = {
      types: [{ typeId: 1, typeName: 'Aide', count: 6, average: 4.333 }],
      members: [{ claimedById: '9', claimedByName: 'M', count: 1, average: 5 }],
    };
    const copy = JSON.parse(JSON.stringify(raw)) as typeof raw;
    maskRatingStats(raw);
    expect(raw).toEqual(copy);
  });
});
