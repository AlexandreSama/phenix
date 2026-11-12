import {
  Injectable,
  UnsupportedMediaTypeException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Pour une action qui agit sur des personnes : le corps doit être du JSON. Un formulaire HTML
 * (`application/x-www-form-urlencoded`) part sans requête préalable ni contrôle CORS, et Nest
 * l'analyse par défaut : ce garde le refuse, le site, lui, envoie toujours du JSON.
 * Défense en plus du cookie SameSite=Lax, qui ne protège pas contre un sous-domaine du même site.
 */
@Injectable()
export class JsonBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.is('application/json')) {
      throw new UnsupportedMediaTypeException('Cette action n’accepte que du JSON');
    }
    return true;
  }
}
