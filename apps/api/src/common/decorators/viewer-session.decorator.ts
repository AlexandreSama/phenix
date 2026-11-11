import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MaybeAuthenticatedRequest } from '../request.js';

/** La session de qui regarde, ou null pour un visiteur. À utiliser derrière OptionalAuthGuard. */
export const ViewerSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<MaybeAuthenticatedRequest>().auth,
);
