import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import { currentUserQuery } from './features/auth/api';
import { GeneralSettingsPage } from './features/dashboard/general/general-settings-page';
import { GuildPickerPage } from './features/dashboard/guild-picker/guild-picker-page';
import { HomePage } from './features/home/home-page';
import { queryClient } from './lib/query';
import { NotFound, RootLayout } from './root-layout';
import { GuildLayout } from './features/dashboard/guild-layout';
import { LevelingSettingsPage } from './features/dashboard/leveling/leveling-settings-page';
import { LeaderboardPage } from './features/leaderboard/leaderboard-page';
import { RolePanelsPage } from './features/dashboard/roles/role-panels-page';
import { RolePanelEditorPage } from './features/dashboard/roles/role-panel-editor-page';
import { TicketsPage } from './features/dashboard/tickets/tickets-page';
import { TicketSettingsPage } from './features/dashboard/tickets/ticket-settings-page';
import { TranscriptPage } from './features/dashboard/tickets/transcript-page';
import { GiveawaysPage } from './features/dashboard/giveaways/giveaway-page';
import { GiveawayCreatePage } from './features/dashboard/giveaways/giveaway-create-page';
import { Td2Page } from './features/dashboard/td2/td2-page';

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: z.object({ connexion: z.string().optional() }),
  component: HomePage,
});

/** Toutes les pages /dashboard demandent d'être connecté. */
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user) throw redirect({ to: '/', search: { connexion: 'requise' } });
  },
});

/** Un serveur : en-tête et onglets communs, chaque onglet est une route enfant. */
const guildRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '$guildId',
  component: GuildLayout,
});

const guildGeneralRoute = createRoute({
  getParentRoute: () => guildRoute,
  path: '/',
  component: GeneralSettingsPage,
});

const guildLevelingRoute = createRoute({
  getParentRoute: () => guildRoute,
  path: 'niveaux',
  component: LevelingSettingsPage,
});

const guildPickerRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: GuildPickerPage,
});

/** Classement public : aucune connexion demandée. Une page invalide dans l'URL revient à la 1. */
const leaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'classement/$guildId',
  validateSearch: z.object({ page: z.number().int().min(1).optional().catch(undefined) }),
  component: LeaderboardPage,
});

/** Onglet « Rôles » : sans composant, la route affiche simplement sa page enfant. */
const guildRolesRoute = createRoute({
  getParentRoute: () => guildRoute,
  path: 'roles',
});

const rolePanelsRoute = createRoute({
  getParentRoute: () => guildRolesRoute,
  path: '/',
  component: RolePanelsPage,
});

/** `nouveau` pour créer, l'ID du panel pour le modifier. */
const rolePanelEditorRoute = createRoute({
  getParentRoute: () => guildRolesRoute,
  path: '$panelId',
  component: RolePanelEditorPage,
});

/** Onglet « Tickets » : la liste, les réglages et la lecture d'un transcript. */
const guildTicketsRoute = createRoute({
  getParentRoute: () => guildRoute,
  path: 'tickets',
});

/** Un filtre ou une page invalide dans l'URL revient à la valeur par défaut. */
const ticketsRoute = createRoute({
  getParentRoute: () => guildTicketsRoute,
  path: '/',
  validateSearch: z.object({
    status: z.enum(['open', 'closed']).optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  component: TicketsPage,
});

/** Chemin fixe : il passe avant $ticketId, TanStack Router préfère toujours le plus précis. */
const ticketSettingsRoute = createRoute({
  getParentRoute: () => guildTicketsRoute,
  path: 'reglages',
  component: TicketSettingsPage,
});

const transcriptRoute = createRoute({
  getParentRoute: () => guildTicketsRoute,
  path: '$ticketId',
  component: TranscriptPage,
});

/** Onglet « Giveaways » : la liste et le formulaire de création. */
const guildGiveawaysRoute = createRoute({
  getParentRoute: () => guildRoute,
  path: 'giveaways',
});

const giveawaysRoute = createRoute({
  getParentRoute: () => guildGiveawaysRoute,
  path: '/',
  validateSearch: z.object({
    status: z.enum(['active', 'ended']).optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  component: GiveawaysPage,
});

const giveawayCreateRoute = createRoute({
  getParentRoute: () => guildGiveawaysRoute,
  path: 'nouveau',
  component: GiveawayCreatePage,
});

/** Onglet « TD2 » : le salon des sorties et les sorties à venir. */
const td2Route = createRoute({
  getParentRoute: () => guildRoute,
  path: 'td2',
  component: Td2Page,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  leaderboardRoute,
  dashboardRoute.addChildren([
    guildPickerRoute,
    guildRoute.addChildren([guildGeneralRoute, guildLevelingRoute]),
  ]),
  guildRoute.addChildren([
    guildGeneralRoute,
    guildLevelingRoute,
    guildRolesRoute.addChildren([rolePanelsRoute, rolePanelEditorRoute]),
    guildTicketsRoute.addChildren([ticketsRoute, ticketSettingsRoute, transcriptRoute]),
    guildGiveawaysRoute.addChildren([giveawaysRoute, giveawayCreateRoute]),
    td2Route,
  ]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

// Rend les routes, paramètres et liens typés dans tout le site
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
