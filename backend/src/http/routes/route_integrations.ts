// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newIntegrationsHandler } from '../handlers/v1/integrations/integrations_handler.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerIntegrationsRoutes нь /integrations/* бүлгийг холбоно — хэрэглэгчийн
 * гуравдагч талын OAuth токен.
 *
 * Хэрэглэгчийн ID нь ЗӨВХӨН JWT-ээс гарна; RLS давхарга нь мөрийн харагдах
 * байдлыг бас барина (гүн хамгаалалт). Middleware-ийг route ТУС БҮРД ил
 * дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerIntegrationsRoutes(router: Router, deps: Deps): void {
  const handler = newIntegrationsHandler(deps.integrationsUC);
  const auth = deps.authMiddleware;

  const integrations = Router();
  integrations.get('/', auth, wrap(handler.list));
  integrations.post('/', auth, wrap(handler.connect));
  integrations.get('/:provider/token', auth, wrap(handler.getToken));
  integrations.delete('/:provider', auth, wrap(handler.disconnect));
  router.use('/integrations', integrations);
}
