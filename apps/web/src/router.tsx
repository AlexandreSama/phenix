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

const routeTree = rootRoute.addChildren([
  homeRoute,
  leaderboardRoute,
  dashboardRoute.addChildren([
    guildPickerRoute,
    guildRoute.addChildren([guildGeneralRoute, guildLevelingRoute]),
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
