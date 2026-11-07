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

const guildPickerRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: GuildPickerPage,
});

const guildGeneralRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '$guildId',
  component: GeneralSettingsPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  dashboardRoute.addChildren([guildPickerRoute, guildGeneralRoute]),
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
