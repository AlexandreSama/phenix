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

/** Remplit le catalogue TD2. Relançable sans risque : rien n'est dupliqué. */
export async function seedTd2Catalogue(prisma: PrismaClient): Promise<void> {
  for (const { kind, name, modes } of TD2_CATALOGUE) {
    const activity = await prisma.td2Activity.upsert({
      where: { kind_name: { kind, name } },
      update: {},
      create: { kind, name },
    });

    for (const [modeName, composition] of Object.entries(modes)) {
      const mode = await prisma.td2ActivityMode.upsert({
        where: { activityId_name: { activityId: activity.id, name: modeName } },
        update: {},
        create: { activityId: activity.id, name: modeName },
      });

      for (const [role, count] of Object.entries(composition)) {
        if (!count) continue;
        await prisma.td2ModeSlot.upsert({
          where: { modeId_role: { modeId: mode.id, role: role as Td2Role } },
          update: { count },
          create: { modeId: mode.id, role: role as Td2Role, count },
        });
      }
    }
  }
}
