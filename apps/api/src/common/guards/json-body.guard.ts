import {
  Injectable,
  UnsupportedMediaTypeException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { hasBody, isJsonRequest, JSON_ONLY_MESSAGE } from '../json-only.js';

/**
 * Pour une action qui agit sur des personnes : le corps est obligatoire, et en JSON. L'intergiciel
 * `jsonOnly` refuse déjà tout formulaire HTML sur les écritures, mais laisse passer une requête sans
 * corps ni `Content-Type` (curl, déconnexion) : ici, ce n'est pas permis.
 */
@Injectable()
export class JsonBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!isJsonRequest(request) || !hasBody(request)) {
      throw new UnsupportedMediaTypeException(JSON_ONLY_MESSAGE);
    }
    return true;
  }
}
