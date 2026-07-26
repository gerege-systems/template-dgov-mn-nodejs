// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Express } from 'express';

import {
  PathAuthorize,
  PathDiscovery,
  PathEndSession,
  PathIntrospect,
  PathJWKS,
  PathRevoke,
  PathToken,
  PathUserinfo,
} from '../../usecases/oidc/discovery.js';
import type { KeyManager } from '../../usecases/oidc/keys.js';
import type { OIDCService } from '../../usecases/oidc/oidc_service.js';
import { newOIDCHandler } from '../handlers/v1/oidc/oidc_handler.js';
import { wrap } from '../response.js';

/**
 * registerOIDCRoutes нь ӨӨРИЙН OAuth2/OIDC provider-ийн НИЙТИЙН endpoint-уудыг
 * холбоно.
 *
 * Эдгээр нь `/api/v1` бүлгээс ГАДУУР, ҮНДЭС дээр сууна — учир нь тэдгээрийн зам
 * нь OIDC стандартаар (`/.well-known/*`) болон nginx-ийн одоо байгаа
 * дүрмүүдээр (`/oauth2/*`, `/userinfo`) тогтоогдсон.
 *
 * Бүгд нээлттэй (JWT шаардахгүй) — client-ийн баталгаажуулалт нь endpoint
 * бүрийн дотор, протоколын дагуу хийгдэнэ.
 */
export function registerOIDCRoutes(
  app: Express,
  keys: KeyManager,
  svc: OIDCService,
  issuer: string,
): void {
  const handler = newOIDCHandler(keys, svc, issuer);

  app.get(PathDiscovery, wrap(handler.discovery));
  app.get(PathJWKS, wrap(handler.jwks));
  app.get(PathAuthorize, wrap(handler.authorize));
  app.post(PathToken, wrap(handler.token));
  app.post(PathIntrospect, wrap(handler.introspect));
  app.post(PathRevoke, wrap(handler.revoke));
  app.get(PathEndSession, wrap(handler.endSession));
  app.get(PathUserinfo, wrap(handler.userinfo));
  app.post(PathUserinfo, wrap(handler.userinfo));
}
