import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En dev, Vite renvoie /api vers l'API : même origine, donc pas de CORS et les cookies passent.
const proxy = { '/api': 'http://localhost:3000' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
