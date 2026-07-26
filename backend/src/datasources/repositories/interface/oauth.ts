// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type {
  OAuthAccessToken,
  OAuthAuthCode,
  OAuthChallenge,
  OAuthClient,
  OAuthRefreshToken,
  SigningKey,
} from '../../../domain/oauth.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * OAuthClientRepository нь oauth_clients хүснэгтийн gateway. Энэ нь системийн
 * ТОХИРГООНЫ хүснэгт (хэрэглэгч-тус-бүрийн БИШ) тул RLS-гүй — зөвшөөрлийг
 * route давхарга (gateway.manage) шийднэ.
 */
export interface OAuthClientRepository {
  list(ctx: Ctx): Promise<OAuthClient[]>;
  get(ctx: Ctx, clientId: string): Promise<OAuthClient>;
  create(ctx: Ctx, client: OAuthClient): Promise<OAuthClient>;
  /**
   * update нь client-ын тохиргоог шинэчилнэ. secret_hash-д ХҮРЭХГҮЙ — түүнийг
   * зөвхөн setSecretHash сольж чадна (санамсаргүй secret устгахаас сэргийлнэ).
   */
  update(ctx: Ctx, client: OAuthClient): Promise<OAuthClient>;
  setSecretHash(ctx: Ctx, clientId: string, hash: string): Promise<void>;
  deleteClient(ctx: Ctx, clientId: string): Promise<void>;
}

/**
 * ServiceScopeResolver нь gateway service id ↔ OAuth scope хооронд хөрвүүлнэ
 * (gateway_services.scope багана).
 */
export interface ServiceScopeResolver {
  serviceScopes(ctx: Ctx, serviceIds: string[]): Promise<string[]>;
  serviceIdsForScopes(ctx: Ctx, scopes: string[]): Promise<string[]>;
}

/**
 * OAuthFlowRepository нь authorize урсгалын түр төлөвийг (challenge, санагдсан
 * consent, authorization code, access/refresh token) хадгална.
 *
 * Эдгээр хүснэгтүүд RLS-тэй бөгөөд протоколын endpoint-ууд НЭВТРЭХЭЭС ӨМНӨ
 * ажилладаг тул дуудагч ctx-д "service" identity тавьсан байх ёстой
 * (usecase давхарга үүнийг өөрөө хийдэг).
 */
export interface OAuthFlowRepository {
  createChallenge(ctx: Ctx, c: NewOAuthChallenge): Promise<void>;
  /**
   * challenge нь ХҮЧИНТЭЙ (хугацаа дуусаагүй, шийдэгдээгүй) challenge-ыг
   * буцаана. Дуусал/шийдэгдсэнийг NotFound-той ижилхэн үзнэ.
   */
  challenge(ctx: Ctx, kind: string, challenge: string): Promise<OAuthChallenge>;
  /** decideChallenge нь challenge-ыг НЭГ УДААГИЙН байдлаар шийдэгдсэн болгоно. */
  decideChallenge(ctx: Ctx, challenge: string, subject: string, granted: string[]): Promise<void>;

  consent(ctx: Ctx, subject: string, clientId: string): Promise<string[]>;
  saveConsent(
    ctx: Ctx,
    subject: string,
    clientId: string,
    scopes: string[],
    ttlMs: number,
  ): Promise<void>;
  revokeConsent(ctx: Ctx, subject: string, clientId: string): Promise<void>;

  createCode(ctx: Ctx, c: OAuthAuthCode): Promise<void>;
  /**
   * consumeCode нь code-ыг АТОМААР нэг удаа зарцуулна. Хоёр дахь удаа ирвэл
   * alreadyUsed=true — дуудагч тухайн session-ий бүх token-ыг цуцлана.
   */
  consumeCode(ctx: Ctx, codeHash: Buffer): Promise<{ code: OAuthAuthCode; alreadyUsed: boolean }>;

  /** storeTokens нь access + (сонголтоор) refresh token-ыг НЭГ гүйлгээнд бичнэ. */
  storeTokens(ctx: Ctx, at: OAuthAccessToken, rt: OAuthRefreshToken | null): Promise<void>;
  accessToken(ctx: Ctx, tokenHash: Buffer): Promise<OAuthAccessToken>;
  /** consumeRefreshToken нь АТОМААР зарцуулна; reused=true бол хулгайн шинж. */
  consumeRefreshToken(
    ctx: Ctx,
    tokenHash: Buffer,
  ): Promise<{ token: OAuthRefreshToken; reused: boolean }>;
  revokeFamily(ctx: Ctx, familyId: string): Promise<void>;
  revokeForSubjectClient(ctx: Ctx, subject: string, clientId: string): Promise<void>;
  revokeAccessToken(ctx: Ctx, tokenHash: Buffer, clientId: string): Promise<boolean>;
  revokeRefreshToken(ctx: Ctx, tokenHash: Buffer, clientId: string): Promise<boolean>;

  /** deleteExpired нь хугацаа дууссан түр мөрүүдийг цэвэрлэнэ (тогтмол ажил). */
  deleteExpired(ctx: Ctx): Promise<void>;
}

/** NewOAuthChallenge нь шинэ challenge бичих оролт (id/цаг DB-ээс). */
export interface NewOAuthChallenge {
  challenge: string;
  kind: string;
  clientId: string;
  subject: string;
  requestedScopes: string[];
  grantedScopes: string[];
  redirectUri: string;
  state: string;
  nonce: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  prompt: string;
  postLogoutRedirectUri: string;
  skip: boolean;
  expiresAt: Date;
}

/**
 * OAuthKeyRepository нь id_token гарын үсгийн түлхүүрүүдийг хадгална.
 * oauth_clients-ийн адил системийн тохиргоо тул RLS-гүй; хувийн түлхүүр нь
 * мөрөндөө шифрлэгдсэн байдлаар хамгаалагдана.
 */
export interface OAuthKeyRepository {
  /** active нь гарын үсэг зурах цорын ганц идэвхтэй түлхүүр (байхгүй бол NotFound). */
  active(ctx: Ctx): Promise<SigningKey>;
  /** all нь JWKS-д нийтлэх БҮХ түлхүүр (тэтгэвэрт гарсныг ч оруулна). */
  all(ctx: Ctx): Promise<SigningKey[]>;
  insert(ctx: Ctx, k: Omit<SigningKey, 'createdAt' | 'retiredAt'>): Promise<void>;
  retireActive(ctx: Ctx): Promise<void>;
}
