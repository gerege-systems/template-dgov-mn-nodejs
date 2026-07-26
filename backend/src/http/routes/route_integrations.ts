// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newIntegrationsHandler } from '../handlers/v1/integrations/integrations_handler.js';
import { newIntegrationsOAuthHandler } from '../handlers/v1/integrations/integrations_oauth_handler.js';
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
  const oauth = newIntegrationsOAuthHandler(deps.integrationsUC, deps.providerOps);
  const auth = deps.authMiddleware;

  const integrations = Router();
  integrations.get('/', auth, wrap(handler.list));
  integrations.post('/', auth, wrap(handler.connect));

  // ── Провайдерын СЕРВЕР ТАЛЫН үйлдлүүд. Эдгээр нь `/:provider` загвараас
  // ӨМНӨ бүртгэгдэх ЁСТОЙ: Express нь эхэлж таарсан route-ыг сонгодог тул
  // `/:provider/token` нь `/google-drive/files`-ыг залгих боломжтой. ──
  integrations.get('/google-drive/files', auth, wrap(oauth.driveFiles));
  integrations.post('/google-drive/upload', auth, wrap(oauth.driveUpload));
  integrations.post('/google-drive/image', auth, wrap(oauth.driveImage));
  integrations.put('/google-drive/files/:id', auth, wrap(oauth.driveRename));
  integrations.delete('/google-drive/files/:id', auth, wrap(oauth.driveDelete));

  integrations.get('/dropbox/files', auth, wrap(oauth.dropboxFiles));
  integrations.get('/dropbox/preview', auth, wrap(oauth.dropboxPreview));
  integrations.post('/dropbox/upload', auth, wrap(oauth.dropboxUpload));

  integrations.post('/google-meet/create-space', auth, wrap(oauth.meetCreateSpace));

  // ── OAuth урсгал. Хоёулаа top-level NAVIGATION (JSON биш, 302) — тиймээс
  // CSRF толгой шаардахгүй ба SameSite=Lax cookie-гоор нэвтрэлт танигдана.
  // callback нь state cookie-гоор CSRF-ээс хамгаалагдана. ──
  integrations.get('/:provider/connect', auth, wrap(oauth.connect));
  integrations.get('/:provider/callback', auth, wrap(oauth.callback));

  integrations.get('/:provider/token', auth, wrap(handler.getToken));
  integrations.delete('/:provider', auth, wrap(handler.disconnect));
  router.use('/integrations', integrations);
}
