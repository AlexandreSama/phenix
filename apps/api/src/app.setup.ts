import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { csrfProtection } from './common/csrf.js';

/** Réglages HTTP communs à main.ts et aux tests de bout en bout. */
/** `publicUrl` : l'adresse du site (PUBLIC_URL), la seule origine qui peut écrire. */
export function configureApp(app: NestExpressApplication, publicUrl: string): void {
  app.setGlobalPrefix('api');
  // Avant tout le reste : une écriture venue d'ailleurs ne doit même pas être analysée
  app.use(csrfProtection(publicUrl));
  app.use(cookieParser());
  // Derrière ton reverse proxy : l'IP et le HTTPS d'origine viennent des en-têtes X-Forwarded-*.
  // En Docker, le proxy de l'hôte arrive par la passerelle du réseau (172.x), une adresse privée
  app.set('trust proxy', ['loopback', 'uniquelocal']);
}
