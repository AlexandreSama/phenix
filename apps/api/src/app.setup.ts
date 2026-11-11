import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** Réglages HTTP communs à main.ts et aux tests de bout en bout. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Derrière ton reverse proxy : l'IP et le HTTPS d'origine viennent des en-têtes X-Forwarded-*.
  // En Docker, le proxy de l'hôte arrive par la passerelle du réseau (172.x), une adresse privée
  app.set('trust proxy', ['loopback', 'uniquelocal']);
}
