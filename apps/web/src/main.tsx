import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Les polices du site, empaquetées par Vite : aucune requête vers un service tiers
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import '@fontsource-variable/space-grotesk/index.css';
import './index.css';
import { queryClient } from './lib/query';
import { router } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable dans index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
