import type { CaseType } from '@phenix/database';
import type { User } from 'discord.js';
import { baseEmbed } from '../../core/embeds.js';
import { formatDuration } from '../../core/format.js';
import { CASE_COLORS, caseLabel, NO_REASON } from './case-format.js';

export interface Notice {
  guildName: string;
  type: CaseType;
  reason: string | null;
  durationMs?: number;
}

/** Prévient le membre en message privé. Renvoie false s'il les a fermés : la sanction continue. */
export async function notifyMember(user: User, notice: Notice): Promise<boolean> {
  const embed = baseEmbed(CASE_COLORS[notice.type])
    .setTitle(`${caseLabel(notice.type)} sur ${notice.guildName}`)
    .addFields({ name: 'Raison', value: notice.reason ?? NO_REASON });
  if (notice.durationMs) {
    embed.addFields({ name: 'Durée', value: formatDuration(notice.durationMs) });
  }

  try {
    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}
