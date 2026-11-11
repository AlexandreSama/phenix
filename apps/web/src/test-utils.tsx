import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Rend `ui` avec ce qu'une page attend autour d'elle : un routeur en mémoire (pour les <Link>)
 * et un client React Query neuf : données fraîches 30 s comme sur le site (lib/query.ts),
 * mais sans nouvel essai en cas d'erreur.
 * Le routeur s'affiche après son premier chargement : chercher avec findBy…
 */
export function renderWithProviders(
  ui: ReactNode,
  /** Ce que le cache contient déjà au premier rendu (l'utilisateur connecté…) */
  prefill?: (queryClient: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
  prefill?.(queryClient);
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient };
}
