import { afterAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import {
  findRolePanel,
  markRolePanelFailed,
  markRolePanelPublished,
  saveRolePanel,
} from './role-panels.js';
import { publicationStatus } from './publication.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

const guildId = `${Date.now()}`;
const input = {
  title: 'Tes jeux',
  description: null,
  channelId: '200000000000000001',
  mode: 'MULTIPLE' as const,
  options: [
    { roleId: '100000000000000002', label: 'Valorant', emoji: null },
    { roleId: '100000000000000001', label: 'The Division 2', emoji: '🎮' },
  ],
};

describe('panels de rôles', () => {
  it('garde l’ordre des boutons, et remplace tout le contenu à la modification', async () => {
    await prisma.guild.create({ data: { id: guildId, name: 'Serveur de test' } });

    const created = await saveRolePanel(prisma, guildId, input);
    expect(created.options.map((option) => [option.position, option.label])).toEqual([
      [0, 'Valorant'],
      [1, 'The Division 2'],
    ]);

    await saveRolePanel(
      prisma,
      guildId,
      { ...input, options: [{ roleId: '100000000000000003', label: 'Minecraft', emoji: null }] },
      created.id,
    );
    const updated = await findRolePanel(prisma, created.id);
    expect(updated?.options.map((option) => option.label)).toEqual(['Minecraft']);
  });

  it('suit la publication : en attente, publié, en erreur, puis de nouveau en attente', async () => {
    const panel = await saveRolePanel(prisma, guildId, input);
    expect(publicationStatus(panel)).toBe('pending');

    await markRolePanelPublished(prisma, panel.id, `${Date.now()}1`);
    const published = await findRolePanel(prisma, panel.id);
    expect(publicationStatus(published!)).toBe('published');

    await markRolePanelFailed(prisma, panel.id, "Le bot n'a pas accès à ce salon");
    expect(publicationStatus((await findRolePanel(prisma, panel.id))!)).toBe('error');

    const saved = await saveRolePanel(prisma, guildId, input, panel.id);
    expect(publicationStatus(saved)).toBe('pending');
    expect(saved.messageId).toBe(published?.messageId); // le message existant sera modifié
  });

  it('ignore la confirmation du bot pour un panel supprimé entre-temps', async () => {
    const panel = await saveRolePanel(prisma, guildId, input);
    await prisma.rolePanel.delete({ where: { id: panel.id } });

    await expect(markRolePanelPublished(prisma, panel.id, '1')).resolves.toBeUndefined();
  });
});
