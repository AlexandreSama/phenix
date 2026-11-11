import type { PrismaClient } from './generated/prisma/client.js';
import type { Td2ActivityKind, Td2Role } from './generated/prisma/enums.js';

type Composition = Partial<Record<Td2Role, number>>;

const RAID_MODES: Record<string, Composition> = {
  Normal: { DPS: 6, HEAL: 1, TANK: 1 },
  'Semi-Speed': { DPS: 5, HEAL: 1, TANK: 2 },
};

const INCURSION_MODES: Record<string, Composition> = {
  Standard: { DPS: 3, HEAL_TANK: 1 },
};

export const TD2_CATALOGUE: {
  kind: Td2ActivityKind;
  name: string;
  modes: Record<string, Composition>;
}[] = [
  { kind: 'RAID', name: 'Dark Hours', modes: RAID_MODES },
  { kind: 'RAID', name: 'Iron Horse', modes: RAID_MODES },
  { kind: 'INCURSION', name: 'Paradis Perdu', modes: INCURSION_MODES },
  { kind: 'INCURSION', name: 'Broken Rain', modes: INCURSION_MODES },
];

/**
 * Les directives du jeu : des contraintes que l'organisateur ajoute à une mission pour la
 * corser (+25 % d'XP chacune en jeu). Les noms français sont les nôtres : le propriétaire
 * du bot les renomme depuis l'administration du site, sans toucher au code.
 */
export const TD2_DIRECTIVES: { name: string; description: string }[] = [
  {
    name: 'Munitions comptées',
    description: 'Moins de munitions en réserve, chargeur entamé perdu, aucune munition au sol.',
  },
  {
    name: 'Compétences alternées',
    description: 'Quand une compétence est active, l’autre se met en recharge.',
  },
  {
    name: 'Brouillard de guerre',
    description: 'Plus de menaces ni d’indicateurs sur la mini-carte.',
  },
  {
    name: 'Sans régénération',
    description: 'La santé ne se régénère plus pendant les combats : seuls les soins la rendent.',
  },
  {
    name: 'Munitions spéciales',
    description:
      'Les ennemis tirent des munitions à effet (feu, saignement, choc…) selon leur faction.',
  },
];

/**
 * Remplit le catalogue TD2. Relançable sans risque, même deux fois en même temps
 * (deux fichiers de test en parallèle) : rien n'est dupliqué.
 *
 * Pas d'`upsert` ici : Prisma le traduit en « chercher, puis insérer », et deux seeds
 * simultanés insèrent tous les deux. `createMany` + `skipDuplicates` devient un seul
 * `INSERT … ON CONFLICT DO NOTHING`, que Postgres rend atomique.
 */
export async function seedTd2Catalogue(prisma: PrismaClient): Promise<void> {
  for (const { kind, name, modes } of TD2_CATALOGUE) {
    await prisma.td2Activity.createMany({ data: [{ kind, name }], skipDuplicates: true });
    const activity = await prisma.td2Activity.findUniqueOrThrow({
      where: { kind_name: { kind, name } },
    });

    for (const [modeName, composition] of Object.entries(modes)) {
      await prisma.td2ActivityMode.createMany({
        data: [{ activityId: activity.id, name: modeName }],
        skipDuplicates: true,
      });
      const mode = await prisma.td2ActivityMode.findUniqueOrThrow({
        where: { activityId_name: { activityId: activity.id, name: modeName } },
      });

      for (const [role, count] of Object.entries(composition)) {
        if (!count) continue;
        const slot = { modeId: mode.id, role: role as Td2Role };
        await prisma.td2ModeSlot.createMany({ data: [{ ...slot, count }], skipDuplicates: true });
        // La composition du seed fait foi : un nombre de places changé ici est mis à jour
        await prisma.td2ModeSlot.update({ where: { modeId_role: slot }, data: { count } });
      }
    }
  }

  // Les directives, une seule fois : renommées ou supprimées depuis le site, elles ne
  // reviennent pas au déploiement suivant
  if ((await prisma.td2Directive.count()) === 0) {
    await prisma.td2Directive.createMany({ data: TD2_DIRECTIVES, skipDuplicates: true });
  }
}
