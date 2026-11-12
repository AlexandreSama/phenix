import {
  DASHBOARD_MODULE_LABELS,
  type DashboardModuleKey,
  type ManageableGuild,
} from '@phenix/shared';
import type { IconName } from '../../components/icon';

export type GuildTabPath =
  | '/dashboard/$guildId'
  | '/dashboard/$guildId/niveaux'
  | '/dashboard/$guildId/roles'
  | '/dashboard/$guildId/tickets'
  | '/dashboard/$guildId/moderation'
  | '/dashboard/$guildId/giveaways'
  | '/dashboard/$guildId/td2'
  | '/dashboard/$guildId/bienvenue'
  | '/dashboard/$guildId/acces';

export interface GuildTab {
  to: GuildTabPath;
  label: string;
  /** Le libellé court, sur téléphone */
  short?: string;
  icon: IconName;
  exact?: boolean;
  /** L'onglet du module ; 'ADMIN' : réservé aux administrateurs du serveur (l'onglet Accès) */
  module: DashboardModuleKey | 'ADMIN';
}

/** Les onglets d'un serveur, dans l'ordre de la navigation. */
export const GUILD_TABS: GuildTab[] = [
  { to: '/dashboard/$guildId', label: 'Général', icon: 'sliders', exact: true, module: 'GENERAL' },
  { to: '/dashboard/$guildId/niveaux', label: 'Niveaux', icon: 'chart', module: 'LEVELING' },
  { to: '/dashboard/$guildId/roles', label: 'Rôles', icon: 'tag', module: 'ROLES' },
  { to: '/dashboard/$guildId/tickets', label: 'Tickets', icon: 'ticket', module: 'TICKETS' },
  {
    to: '/dashboard/$guildId/moderation',
    label: DASHBOARD_MODULE_LABELS.MODERATION,
    icon: 'shield',
    module: 'MODERATION',
  },
  { to: '/dashboard/$guildId/giveaways', label: 'Giveaways', icon: 'gift', module: 'GIVEAWAYS' },
  {
    to: '/dashboard/$guildId/td2',
    label: DASHBOARD_MODULE_LABELS.TD2,
    short: 'TD2',
    icon: 'crosshair',
    module: 'TD2',
  },
  {
    to: '/dashboard/$guildId/bienvenue',
    label: DASHBOARD_MODULE_LABELS.WELCOME,
    icon: 'users',
    module: 'WELCOME',
  },
  { to: '/dashboard/$guildId/acces', label: 'Accès', icon: 'users', module: 'ADMIN' },
];

/** Cet utilisateur peut-il ouvrir cet onglet ? Un administrateur, tous ; un délégué, les siens. */
export function canOpen(
  guild: Pick<ManageableGuild, 'access' | 'modules'>,
  module: GuildTab['module'],
) {
  if (guild.access === 'admin') return true;
  return module !== 'ADMIN' && guild.modules.includes(module);
}

/** Les onglets qu'il voit dans la navigation. */
export const visibleTabs = (guild: Pick<ManageableGuild, 'access' | 'modules'>) =>
  GUILD_TABS.filter((tab) => canOpen(guild, tab.module));

/** Le premier onglet qu'il peut ouvrir : là où mène la carte du serveur. */
export const firstTab = (guild: Pick<ManageableGuild, 'access' | 'modules'>): GuildTabPath =>
  visibleTabs(guild)[0]?.to ?? '/dashboard/$guildId';
