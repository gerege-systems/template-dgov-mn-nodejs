// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// ӨӨРИЙН OAuth2/OIDC provider-ийн НИЙТИЙН endpoint-ууд (`/oauth2/*`,
// `/userinfo`, `/.well-known/*`).
//
// АНХААР: эдгээр нь OAuth2/OIDC-ийн СТАНДАРТ гэрээ тул платформын ердийн
// `BaseResponse` дугтуйг ХЭРЭГЛЭХГҮЙ — RP-ийн сангууд задлахгүй. Хариу нь
// RFC-ийн заасан JSON биетэй, алдаа нь RFC 6749 §5.2-ийн `{"error": …}`.

import { DomainError, ErrorType } from '../../../../apperror/index.js';
import type { OAuthClient } from '../../../../domain/oauth.js';
import { buildDiscovery } from '../../../../usecases/oidc/discovery.js';
import type { KeyManager } from '../../../../usecases/oidc/keys.js';
import {
  AuthorizeError,
  TokenError,
  type OIDCService,
  type TokenRequest,
} from '../../../../usecases/oidc/oidc_service.js';
import * as logger from '../../../../pkg/logger/logger.js';
import type { AsyncHandler, Request, Response } from '../../../types.js';

/** writeJson нь стандартын дагуу түүхий JSON бичнэ (BaseResponse дугтуйгүй). */
function writeJson(res: Response, status: number, body: unknown): void {
  res.status(status).type('application/json;charset=UTF-8').send(JSON.stringify(body));
}

/** writeError нь RFC 6749 §5.2-ийн алдааны биетийг буцаана. */
function writeError(res: Response, status: number, code: string, description: string): void {
  writeJson(res, status, { error: code, error_description: description });
}

/** formValue нь x-www-form-urlencoded биетээс утга авна. */
function formValue(req: Request, key: string): string {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null) return '';
  const v: unknown = (body as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

/** queryValue нь query-гээс мөр утга авна. */
function queryValue(req: Request, key: string): string {
  const v: unknown = req.query[key];
  return typeof v === 'string' ? v : '';
}

/**
 * basicClientAuth нь Authorization: Basic-аас client итгэмжлэлийг задална.
 *
 * RFC 6749 §2.3.1 нь client_id/secret-ыг base64-ийн ӨМНӨ form-urlencode хийхийг
 * шаарддаг — тусгай тэмдэгттэй secret зөв ажиллахын тулд буцааж decode хийнэ.
 */
function basicClientAuth(req: Request): { clientId: string; clientSecret: string } | null {
  const header = req.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('basic ')) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return null;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return null;
  const unescape = (s: string): string => {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '));
    } catch {
      return s;
    }
  };
  return {
    clientId: unescape(decoded.slice(0, sep)),
    clientSecret: unescape(decoded.slice(sep + 1)),
  };
}

/** bearerToken нь Authorization: Bearer <token>-ыг гаргаж авна. */
function bearerToken(req: Request): string {
  const header = req.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

export class OIDCHandler {
  private readonly issuer: string;

  constructor(
    private readonly keys: KeyManager,
    private readonly svc: OIDCService,
    issuer: string,
  ) {
    this.issuer = issuer.replace(/\/+$/, '');
  }

  /** GET /.well-known/openid-configuration */
  discovery: AsyncHandler = (req, res) => {
    // Discovery нь ховор өөрчлөгддөг ба RP-үүд кэшилдэг.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    writeJson(res, 200, buildDiscovery(this.issuer));
  };

  /** GET /.well-known/jwks.json */
  jwks: AsyncHandler = async (req, res) => {
    let set;
    try {
      set = await this.keys.jwks(req.ctx);
    } catch (err) {
      logger.errorWithContext(req.ctx, 'OIDC: JWKS-ийг уншиж чадсангүй', {
        error: logger.errText(err),
      });
      writeError(res, 500, 'server_error', 'could not load signing keys');
      return;
    }
    // Түлхүүр эргэлт нь шинэ kid авчирдаг тул RP-үүд удаан кэшлэх ёсгүй.
    res.setHeader('Cache-Control', 'public, max-age=300');
    writeJson(res, 200, set);
  };

  /** GET /oauth2/auth */
  authorize: AsyncHandler = async (req, res) => {
    try {
      const { challenge } = await this.svc.authorize(req.ctx, {
        clientId: queryValue(req, 'client_id'),
        redirectUri: queryValue(req, 'redirect_uri'),
        responseType: queryValue(req, 'response_type'),
        scope: queryValue(req, 'scope'),
        state: queryValue(req, 'state'),
        nonce: queryValue(req, 'nonce'),
        codeChallenge: queryValue(req, 'code_challenge'),
        codeChallengeMethod: queryValue(req, 'code_challenge_method'),
        prompt: queryValue(req, 'prompt'),
      });
      // Нэвтрэх хуудас руу. Session байвал тэр хуудас шууд accept руу шилжинэ.
      res.redirect(
        302,
        `${this.issuer}/oauth/login?login_challenge=${encodeURIComponent(challenge)}`,
      );
    } catch (err) {
      if (err instanceof AuthorizeError) {
        // Зөвхөн service-ийн БАТАЛГААЖУУЛСАН хаяг руу чиглүүлнэ. Хүсэлтээс
        // ирсэн түүхий redirect_uri-г энд огт ашиглахгүй.
        if (!err.canRedirect()) {
          writeError(res, 400, err.code, err.description);
          return;
        }
        res.redirect(302, err.redirectUrl());
        return;
      }
      logger.errorWithContext(req.ctx, 'OIDC: authorize амжилтгүй', {
        error: logger.errText(err),
      });
      writeError(res, 500, 'server_error', 'could not start the authorization request');
    }
  };

  /** POST /oauth2/token */
  token: AsyncHandler = async (req, res) => {
    const tokenReq: TokenRequest = {
      grantType: formValue(req, 'grant_type'),
      code: formValue(req, 'code'),
      redirectUri: formValue(req, 'redirect_uri'),
      codeVerifier: formValue(req, 'code_verifier'),
      refreshToken: formValue(req, 'refresh_token'),
      scope: formValue(req, 'scope'),
      clientId: formValue(req, 'client_id'),
      clientSecret: formValue(req, 'client_secret'),
      secretFromBasic: false,
    };
    // HTTP Basic нь биетээс ДАВУУ — хоёулаа ирвэл Basic-ыг авна (RFC 6749 §2.3.1).
    const basic = basicClientAuth(req);
    if (basic) {
      tokenReq.clientId = basic.clientId;
      tokenReq.clientSecret = basic.clientSecret;
      tokenReq.secretFromBasic = true;
    }

    // Token нь ХЭЗЭЭ Ч кэшлэгдэх ёсгүй.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    try {
      writeJson(res, 200, await this.svc.token(req.ctx, tokenReq));
    } catch (err) {
      if (err instanceof TokenError) {
        if (err.code === 'invalid_client') {
          // RFC 6749 §5.2 — Basic ашигласан бол WWW-Authenticate буцаана.
          res.setHeader('WWW-Authenticate', 'Basic realm="oauth2"');
        }
        writeError(res, err.status, err.code, err.description);
        return;
      }
      logger.errorWithContext(req.ctx, 'OIDC: token гаргаж чадсангүй', {
        error: logger.errText(err),
        grant_type: tokenReq.grantType,
      });
      writeError(res, 500, 'server_error', 'could not issue a token');
    }
  };

  /** GET|POST /userinfo */
  userinfo: AsyncHandler = async (req, res) => {
    const token = bearerToken(req);
    if (token === '') {
      res.setHeader('WWW-Authenticate', 'Bearer realm="userinfo"');
      writeError(res, 401, 'invalid_token', 'a bearer access token is required');
      return;
    }
    let claims: Record<string, unknown>;
    try {
      claims = await this.svc.userinfo(req.ctx, token);
    } catch {
      res.setHeader('WWW-Authenticate', 'Bearer realm="userinfo", error="invalid_token"');
      writeError(res, 401, 'invalid_token', 'the access token is not valid for userinfo');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    writeJson(res, 200, claims);
  };

  /** POST /oauth2/introspect */
  introspect: AsyncHandler = async (req, res) => {
    const client = await this.authenticateCaller(req, res);
    if (!client) return;
    // Зөвхөн ӨӨРИЙН token-ыг шалгана — өөр client-ийнх бол active:false.
    const info = await this.svc.introspect(req.ctx, client.clientId, formValue(req, 'token'));
    res.setHeader('Cache-Control', 'no-store');
    // `scopes` нь дотоод талбар — гадагш гаргахгүй.
    const { scopes: _scopes, ...body } = info;
    writeJson(res, 200, body);
  };

  /** POST /oauth2/revoke */
  revoke: AsyncHandler = async (req, res) => {
    const client = await this.authenticateCaller(req, res);
    if (!client) return;
    try {
      await this.svc.revoke(
        req.ctx,
        client,
        formValue(req, 'token'),
        formValue(req, 'token_type_hint'),
      );
    } catch (err) {
      logger.errorWithContext(req.ctx, 'OIDC: revoke амжилтгүй', { error: logger.errText(err) });
      writeError(res, 500, 'server_error', 'could not revoke the token');
      return;
    }
    // RFC 7009 §2.2 — амжилттай үед хоосон 200.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).end();
  };

  /** GET /oauth2/sessions/logout */
  endSession: AsyncHandler = async (req, res) => {
    let challenge: string;
    try {
      challenge = await this.svc.startLogout(
        req.ctx,
        queryValue(req, 'client_id'),
        queryValue(req, 'id_token_hint'),
        queryValue(req, 'post_logout_redirect_uri'),
        queryValue(req, 'state'),
      );
    } catch (err) {
      // Яагаад болохгүйг RP-д хэлнэ — "could not start logout" гэдэг нь
      // интеграц хийж буй хүнд юу ч хэлдэггүй байсан.
      const desc =
        err instanceof DomainError && err.type === ErrorType.BadRequest
          ? err.message
          : 'could not start logout';
      logger.errorWithContext(req.ctx, 'OIDC: logout эхлүүлж чадсангүй', {
        error: logger.errText(err),
      });
      writeError(res, 400, 'invalid_request', desc);
      return;
    }
    res.redirect(
      302,
      `${this.issuer}/oauth/logout?logout_challenge=${encodeURIComponent(challenge)}`,
    );
  };

  /**
   * authenticateCaller нь introspect/revoke-ийг дуудаж буй client-ийг
   * баталгаажуулна. Эдгээр endpoint нээлттэй байвал дурын хүн token-ийн төлөвийг
   * шалгах (эсвэл цуцлах) боломжтой болно.
   */
  private async authenticateCaller(req: Request, res: Response): Promise<OAuthClient | null> {
    const tokenReq: TokenRequest = {
      grantType: '',
      code: '',
      redirectUri: '',
      codeVerifier: '',
      refreshToken: '',
      scope: '',
      clientId: formValue(req, 'client_id'),
      clientSecret: formValue(req, 'client_secret'),
      secretFromBasic: false,
    };
    const basic = basicClientAuth(req);
    if (basic) {
      tokenReq.clientId = basic.clientId;
      tokenReq.clientSecret = basic.clientSecret;
      tokenReq.secretFromBasic = true;
    }

    let client: OAuthClient;
    try {
      client = await this.svc.authenticateClient(req.ctx, tokenReq);
    } catch {
      res.setHeader('WWW-Authenticate', 'Basic realm="oauth2"');
      writeError(res, 401, 'invalid_client', 'client authentication failed');
      return null;
    }
    // Public client (auth method = none) нь ЮУ Ч батлаагүй — түүний client_id нь
    // SPA/мобайл багцад ил байдаг. Token endpoint дээр PKCE нөхдөг ч энд нөхөх
    // зүйл байхгүй тул introspect/revoke-д хүлээж авахгүй.
    if (client.tokenEndpointAuthMethod === 'none') {
      res.setHeader('WWW-Authenticate', 'Basic realm="oauth2"');
      writeError(
        res,
        401,
        'invalid_client',
        'this endpoint requires a client that authenticates with a secret',
      );
      return null;
    }
    return client;
  }
}

export const newOIDCHandler = (keys: KeyManager, svc: OIDCService, issuer: string): OIDCHandler =>
  new OIDCHandler(keys, svc, issuer);
