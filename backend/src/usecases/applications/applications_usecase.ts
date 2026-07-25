// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/applications нь API Gateway consumer + SSO RP-ийг НЭГТГЭСЭН
// "Applications" загварын бизнес логик.
//
// Апп бүр яг НЭГ OAuth2 client-тэй тохирно (web/spa/native = authorization_code
// RP, m2m = client_credentials). Аппад зөвшөөрсөн gateway service-үүд нь
// client-ийн OAuth scope болно (`svc:*`). Client secret-ийн ЗӨВХӨН hash
// хадгалагдана; түүхий secret нь create/rotate/set хариунд НЭГ л удаа гарна.

import { randomBytes } from 'node:crypto';

import { badRequest, internalCause, is, ErrorType } from '../../apperror/index.js';
import type {
  OAuthClientRepository,
  ServiceScopeResolver,
} from '../../datasources/repositories/interface/oauth.js';
import type { Application } from '../../domain/application.js';
import { appIsPublic, AppTypes, appUsesRedirect } from '../../domain/application.js';
import type { OAuthClient } from '../../domain/oauth.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { hash as hashSecret } from '../../pkg/secrethash/secrethash.js';

/** Гараар оноох client secret-ийн зөвшөөрөгдөх урт — сул secret хүлээж авахгүй. */
const minSecretLen = 16;
const maxSecretLen = 128;

/** Input нь апп үүсгэх/шинэчлэх талбарууд. appType нь grant/auth-method-ыг тодорхойлно. */
export interface ApplicationInput {
  name: string;
  appType: string;
  redirectUris: string[];
  tags: string[];
  serviceIds: string[];
  enabled: boolean;
}

export interface ApplicationsUsecase {
  /** list нь бүх апп-ыг буцаана (secret-ГҮЙ). */
  list(ctx: Ctx): Promise<Application[]>;
  /** get нь нэг апп-ыг id-гээр буцаана (secret-ГҮЙ). */
  get(ctx: Ctx, id: string): Promise<Application>;
  /**
   * create нь OAuth2 client үүсгэнэ. Confidential (web/m2m) апп-ын
   * client_secret-ыг хариунд НЭГ удаа буцаана (DB-д hash хадгалагдана).
   */
  create(ctx: Ctx, input: ApplicationInput): Promise<Application>;
  /** update нь тохиргоог шинэчилнэ (secret ХЭВЭЭР — түүнийг зөвхөн rotate/set сольно). */
  update(ctx: Ctx, id: string, input: ApplicationInput): Promise<Application>;
  /** deleteApp нь client-ыг устгана (идемпотент). */
  deleteApp(ctx: Ctx, id: string): Promise<void>;
  /** rotateSecret нь confidential апп-ын secret-ыг сольж НЭГ удаа буцаана. */
  rotateSecret(ctx: Ctx, id: string): Promise<Application>;
  /** setSecret нь админаас өгсөн ТОДОРХОЙ secret-ыг тавина (гадаад RP-тэй тулгах). */
  setSecret(ctx: Ctx, id: string, secret: string): Promise<Application>;
  /** setServices нь апп-ын зөвшөөрсөн service-үүдийг (scope) сольно. */
  setServices(ctx: Ctx, id: string, serviceIds: string[]): Promise<Application>;
}

/** randomHex нь client_id-ийн санамсаргүй хэсэг. */
const randomHex = (n: number): string => randomBytes(n).toString('hex');

/**
 * randomToken нь үсэг-тоон secret үүсгэнэ. Modulo хазайлт (alphabet нь 62 тул
 * 256 % 62 ≠ 0) нь Go хувилбартай ижил — эдгээр нь 40 тэмдэгтийн урттай тул
 * үлдэгдэл энтропи хангалттай.
 */
function randomToken(n: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(n);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** cleanList нь trim + хоосон/давхардсаныг хасна (ДАРААЛАЛ хадгална). */
function cleanList(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.trim();
    if (s === '' || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** grantsFor нь апп төрлөөр grant_types / response_types / auth method-ыг өгнө. */
function grantsFor(appType: string): {
  grants: string[];
  responseTypes: string[];
  authMethod: string;
} {
  switch (appType) {
    case 'm2m':
      return {
        grants: ['client_credentials'],
        responseTypes: [],
        authMethod: 'client_secret_basic',
      };
    case 'spa':
    case 'native':
      // Public client — secret нууцалж чадахгүй тул auth method нь `none`
      // (PKCE заавал).
      return {
        grants: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        authMethod: 'none',
      };
    default:
      return {
        grants: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        authMethod: 'client_secret_basic',
      };
  }
}

/**
 * validateRedirectUri нь RFC 6749 §3.1.2-ийн шаардлагыг барина: үнэмлэхүй URL,
 * fragment-гүй, https (эсвэл loopback дээр http). native апп-д RFC 8252-ийн
 * private-use scheme (myapp://) зөвшөөрөгдөнө.
 */
function validateRedirectUri(raw: string, allowPrivateScheme: boolean): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw badRequest('redirect_uri: invalid URL');
  }
  if (u.hash !== '') throw badRequest('redirect_uri: fragments not allowed (RFC 6749 §3.1.2)');

  if (u.protocol === 'https:') return;
  if (u.protocol === 'http:') {
    const host = u.hostname;
    // Зөвхөн loopback — эс бөгөөс authorization code сүлжээгээр ил явна.
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]' && host !== '::1') {
      throw badRequest('redirect_uri: http only allowed on loopback');
    }
    return;
  }
  if (allowPrivateScheme) return;
  throw badRequest('redirect_uri: scheme must be https (or http on loopback)');
}

/** validate нь оролтыг шалгаж нормчилсон домэйн апп болгоно. */
function validate(input: ApplicationInput): Application {
  const name = input.name.trim();
  if (name === '') throw badRequest('application name is required');
  if (name.length > 128) throw badRequest('application name too long (max 128)');

  const appType = input.appType.trim() === '' ? 'm2m' : input.appType.trim();
  if (!AppTypes.has(appType)) throw badRequest('app_type must be web, spa, native or m2m');

  let redirects = cleanList(input.redirectUris);
  if (appUsesRedirect(appType)) {
    if (redirects.length === 0) {
      throw badRequest('at least one redirect_uri is required for this app type');
    }
    for (const uri of redirects) validateRedirectUri(uri, appType === 'native');
  } else {
    redirects = []; // m2m нь redirect ашиглахгүй.
  }

  return {
    id: '',
    clientId: '',
    name,
    appType,
    tags: cleanList(input.tags),
    redirectUris: redirects,
    enabled: input.enabled,
    createdBy: '',
    serviceIds: cleanList(input.serviceIds),
    secret: '',
    createdAt: new Date(0),
    updatedAt: null,
  };
}

/**
 * postLogoutFromRedirects нь redirect_uri бүрийн ГАРАЛ ҮҮСЛЭЭС (scheme://host/)
 * logout-ийн дараах буцах хаягийг гаргана. RP-үүд ихэвчлэн үндсэн хаяг руугаа
 * буцдаг ба бүртгэгдээгүй бол end-session endpoint 400 өгдөг.
 */
function postLogoutFromRedirects(redirects: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of redirects) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    // native private-use scheme (myapp://) нь host-гүй тул origin гэж үзэхгүй.
    if (u.host === '') continue;
    const origin = `${u.protocol}//${u.host}/`;
    if (!seen.has(origin)) {
      seen.add(origin);
      out.push(origin);
    }
  }
  return out;
}

/** filterSvcScopes нь scope-уудаас зөвхөн gateway service scope-уудыг (svc:*) авна. */
const filterSvcScopes = (scopes: string[]): string[] => scopes.filter((s) => s.startsWith('svc:'));

/**
 * buildClient нь домэйн апп + шийдэгдсэн scope-оос хадгалах client мөрийг
 * угсарна. secretHash-ыг ЭНД тавихгүй — create нь өөрөө нэмнэ, update нь огт
 * хүрэхгүй.
 */
function buildClient(app: Application, scopes: string[]): OAuthClient {
  const { grants, responseTypes, authMethod } = grantsFor(app.appType);
  const usesRedirect = appUsesRedirect(app.appType);
  return {
    clientId: app.clientId,
    clientName: app.name,
    secretHash: '',
    tokenEndpointAuthMethod: authMethod,
    appType: app.appType,
    grantTypes: grants,
    responseTypes,
    scopes,
    redirectUris: usesRedirect ? app.redirectUris : [],
    postLogoutRedirectUris: usesRedirect ? postLogoutFromRedirects(app.redirectUris) : [],
    tags: app.tags,
    enabled: app.enabled,
    createdBy: app.createdBy,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

class ApplicationsUsecaseImpl implements ApplicationsUsecase {
  constructor(
    private readonly svc: ServiceScopeResolver,
    private readonly clients: OAuthClientRepository,
  ) {}

  async list(ctx: Ctx): Promise<Application[]> {
    const clients = await this.clients.list(ctx);
    return await Promise.all(clients.map((c) => this.clientToApp(ctx, c)));
  }

  async get(ctx: Ctx, id: string): Promise<Application> {
    // repo нь NotFound-ыг аль хэдийн төрөлжүүлсэн.
    return await this.clientToApp(ctx, await this.clients.get(ctx, id));
  }

  async create(ctx: Ctx, input: ApplicationInput): Promise<Application> {
    const app = validate(input);
    app.clientId = `app-${randomHex(8)}`;
    app.id = app.clientId; // Тусдаа UUID байхгүй — client_id нь танигч.
    app.createdBy = ctx.user?.id ?? '';

    const scopes = await this.scopesFor(ctx, app.appType, app.serviceIds);

    // Public (spa/native) нь secret нууцалж чадахгүй тул ОГТ үүсгэхгүй.
    let secret = '';
    let secretHash = '';
    if (!appIsPublic(app.appType)) {
      secret = randomToken(40);
      try {
        secretHash = await hashSecret(secret);
      } catch (err) {
        throw internalCause(err);
      }
    }

    const client = buildClient(app, scopes);
    client.secretHash = secretHash;
    const created = await this.clients.create(ctx, client);

    const out = await this.clientToApp(ctx, created);
    // Түүхий secret нь ЗӨВХӨН энэ хариунд, НЭГ удаа — хадгалагдсан нь hash.
    out.secret = secret;
    return out;
  }

  async update(ctx: Ctx, id: string, input: ApplicationInput): Promise<Application> {
    const app = validate(input);
    app.id = id;
    app.clientId = id;

    const scopes = await this.scopesFor(ctx, app.appType, app.serviceIds);
    // update нь secret_hash-д хүрэхгүй (repository-ийн баталгаа) — rotate биш.
    const updated = await this.clients.update(ctx, buildClient(app, scopes));
    return await this.clientToApp(ctx, updated);
  }

  async deleteApp(ctx: Ctx, id: string): Promise<void> {
    try {
      await this.clients.deleteClient(ctx, id);
    } catch (err) {
      // Аль хэдийн байхгүй бол амжилттай гэж үзнэ (ИДЕМПОТЕНТ устгалт).
      if (!is(err, ErrorType.NotFound)) throw err;
    }
  }

  async rotateSecret(ctx: Ctx, id: string): Promise<Application> {
    return await this.applySecret(ctx, id, randomToken(40));
  }

  async setSecret(ctx: Ctx, id: string, secret: string): Promise<Application> {
    const trimmed = secret.trim();
    if (trimmed.length < minSecretLen) {
      throw badRequest(`client secret must be at least ${String(minSecretLen)} characters`);
    }
    if (trimmed.length > maxSecretLen) {
      throw badRequest(`client secret too long (max ${String(maxSecretLen)})`);
    }
    return await this.applySecret(ctx, id, trimmed);
  }

  /**
   * applySecret нь confidential апп-ын secret-ыг өгөгдсөн утгаар сольж, шинэ
   * secret-ыг хариунд НЭГ удаа буцаана (rotate ба set-ийн нийтлэг зам). DB-д
   * зөвхөн hash хадгалагдана.
   */
  private async applySecret(ctx: Ctx, id: string, secret: string): Promise<Application> {
    const client = await this.clients.get(ctx, id);
    const app = await this.clientToApp(ctx, client);
    if (appIsPublic(app.appType)) {
      throw badRequest('public client (spa/native) has no secret to rotate');
    }
    let hashed: string;
    try {
      hashed = await hashSecret(secret);
    } catch (err) {
      throw internalCause(err);
    }
    await this.clients.setSecretHash(ctx, id, hashed);
    app.secret = secret;
    return app;
  }

  async setServices(ctx: Ctx, id: string, serviceIds: string[]): Promise<Application> {
    const client = await this.clients.get(ctx, id);
    const app = await this.clientToApp(ctx, client);
    app.serviceIds = cleanList(serviceIds);
    const scopes = await this.scopesFor(ctx, app.appType, app.serviceIds);
    const updated = await this.clients.update(ctx, buildClient(app, scopes));
    return await this.clientToApp(ctx, updated);
  }

  /** scopesFor нь base OIDC scope (RP төрөлд) + service-үүдийн scope-г нэгтгэнэ. */
  private async scopesFor(ctx: Ctx, appType: string, serviceIds: string[]): Promise<string[]> {
    const base = appUsesRedirect(appType) ? ['openid', 'profile', 'email'] : [];
    const svc = await this.svc.serviceScopes(ctx, serviceIds);
    return cleanList([...base, ...svc]);
  }

  /**
   * clientToApp нь хадгалагдсан OAuth2 client-ыг админд харагдах домэйн
   * Application болгоно. Service id-уудыг svc:* scope-оос СЭРГЭЭНЭ.
   */
  private async clientToApp(ctx: Ctx, c: OAuthClient): Promise<Application> {
    const serviceIds = await this.svc.serviceIdsForScopes(ctx, filterSvcScopes(c.scopes));
    return {
      id: c.clientId,
      clientId: c.clientId,
      name: c.clientName,
      appType: c.appType,
      tags: c.tags,
      redirectUris: c.redirectUris,
      enabled: c.enabled,
      createdBy: c.createdBy,
      serviceIds: cleanList(serviceIds),
      secret: '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}

export const newApplicationsUsecase = (
  svc: ServiceScopeResolver,
  clients: OAuthClientRepository,
): ApplicationsUsecase => new ApplicationsUsecaseImpl(svc, clients);
