// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/sso нь гадаад SSO provider (OIDC)-ээр нэвтрэх урсгал — eID-ийн
// зэрэгцээ нэвтрэх 2 дахь арга.
//
// Authorization Code flow: `start` нь authorize URL (state-тэй) буцаана,
// `complete` нь callback-ийн code-ийг солиж, иргэнийг sso_sub/civil_id-ээр
// upsert хийж, ӨӨРИЙН JWT хос олгоно (eID login-тэй ижил session).

import { createHash, randomBytes } from 'node:crypto';

import { badRequest, forbidden, internalCause } from '../../apperror/index.js';
import type { RedisCache } from '../../datasources/caches/redis.js';
import type {
  PlatformSettingsRepository,
  SSOUserRepository,
} from '../../datasources/repositories/interface/sso.js';
import { AccessModePrivate } from '../../domain/platform.js';
import { isAdmin, RoleUser, type User } from '../../domain/users.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { JWTService, TokenPair } from '../../pkg/jwt/jwt.js';
import * as logger from '../../pkg/logger/logger.js';
import type { OIDCClient, Tokens } from '../../pkg/oidc/oidc.js';
import { refreshKey } from '../auth/redis_keys.js';

/** stateTtlSeconds нь authorize↔callback хоорондын state-ийн амьдрах хугацаа. */
const stateTtlSeconds = 10 * 60;
/** statePrefix нь Redis дахь нэг удаагийн state (CSRF) түлхүүрийн угтвар. */
const statePrefix = 'sso:state:';
/** idtPrefix нь logout ref → id_token хадгалуурын угтвар. */
const idtPrefix = 'sso:idt:';
/** logoutTtlSeconds нь session-тэй ойролцоо (гарах хүртэл logout ажиллана). */
const logoutTtlSeconds = 7 * 24 * 60 * 60;

/** accessDeniedMsg нь private платформд бүртгэлгүй иргэнд буцаах мессеж. */
const accessDeniedMsg =
  'Энэ платформ хаалттай (private). Танд нэвтрэх эрх олгогдоогүй байна — системийн админд хандана уу.';

/**
 * SSOTokenStorer нь нэвтрэлтийн дараа иргэний SSO OAuth токенуудыг хадгална
 * (SSO eID proxy-д зориулж). null бол токен хадгалахгүй (proxy идэвхгүй).
 */
export interface SSOTokenStorer {
  store(ctx: Ctx, userId: string, tokens: Tokens): Promise<void>;
}

/** CompleteResult нь callback дуусахад олгосон токен хос + хэрэглэгч. */
export interface CompleteResult {
  token: string;
  refreshToken: string;
  /**
   * logoutRef нь id_token-ы БОГИНО түлхүүр. id_token нь Redis-д ref-ээр
   * хадгалагдана — том cookie/header-ээс зайлсхийж (nginx buffer), гарах үед
   * ref-ээр logout URL байгуулна.
   */
  logoutRef: string;
  user: User;
}

export interface SSOUsecase {
  /** configured нь SSO client бүрэн тохируулагдсан (нэвтрэлт идэвхтэй) эсэх. */
  configured(): boolean;
  /** start нь шинэ state үүсгэж (Redis-д хадгалж), authorize URL буцаана. */
  start(ctx: Ctx): Promise<string>;
  /** complete нь state-ийг шалгаж, code-ийг солиж, иргэнийг upsert хийн JWT олгоно. */
  complete(ctx: Ctx, state: string, code: string): Promise<CompleteResult>;
  /**
   * completeNative нь mobile (PKCE, public client) урсгалын code-ийг солино.
   * Web-ийн state/CSRF шалгалт БАЙХГҮЙ — native дээр PKCE (code_verifier) нь
   * replay/interception хамгаалалтыг хангана.
   */
  completeNative(
    ctx: Ctx,
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<CompleteResult>;
  /** logoutUrl нь ref-ээр id_token-ыг авч (GetDel), RP-initiated logout URL байгуулна. */
  logoutUrl(ctx: Ctx, ref: string): Promise<string>;
}

/** randomToken нь 32 hex тэмдэгтийн (16 байт) crypto-random токен. */
const randomToken = (): string => randomBytes(16).toString('hex');

/**
 * subSlug нь pairwise sub-ээс тогтвортой, богино (20 hex) слаг гаргана —
 * username (≤25) ба email (≤50)-д таарна, тусгай тэмдэггүй.
 */
const subSlug = (sub: string): string =>
  createHash('sha256').update(sub, 'utf8').digest('hex').slice(0, 20);

class SSOUsecaseImpl implements SSOUsecase {
  constructor(
    private readonly oidc: OIDCClient,
    private readonly store: SSOUserRepository,
    private readonly jwtService: JWTService,
    private readonly redis: RedisCache,
    private readonly nativeClientId: string,
    /** tokens нь сонголттой — null бол SSO токен хадгалахгүй. */
    private readonly tokens: SSOTokenStorer | null,
    /** access нь сонголттой — null бол public гэж үзнэ. */
    private readonly access: PlatformSettingsRepository | null,
  ) {}

  configured(): boolean {
    return this.oidc.configured();
  }

  async start(ctx: Ctx): Promise<string> {
    if (!this.oidc.configured()) {
      throw internalCause(new Error('sso client not configured'));
    }
    const state = randomToken();
    const nonce = randomToken();
    // State-ийг Redis-д НЭГ УДААГИЙН (callback дээр GetDel) хэлбэрээр хадгална —
    // callback-ийн CSRF/replay хамгаалалт.
    try {
      await this.redis.setTTL(ctx, statePrefix + state, nonce, stateTtlSeconds);
    } catch (err) {
      throw internalCause(err);
    }
    return this.oidc.authCodeUrl(state, nonce);
  }

  async complete(ctx: Ctx, state: string, code: string): Promise<CompleteResult> {
    if (!this.oidc.configured()) {
      throw internalCause(new Error('sso client not configured'));
    }
    if (state.trim() === '' || code.trim() === '') {
      throw badRequest('SSO callback дутуу параметртэй байна');
    }
    // State-ийг НЭГ УДАА шалгаж устгана — байхгүй бол хугацаа дууссан/хуурамч.
    let consumed = '';
    try {
      consumed = await this.redis.getDel(ctx, statePrefix + state);
    } catch {
      consumed = '';
    }
    if (consumed === '') {
      throw badRequest('SSO нэвтрэлтийн хугацаа дууссан эсвэл хүчингүй байна. Дахин оролдоно уу.');
    }

    let tokens: Tokens;
    try {
      // refresh_token (offline_access) нь SSO eID proxy-д зориулж хадгалагдана.
      tokens = await this.oidc.exchange(code, ctx.signal);
    } catch (err) {
      throw internalCause(err);
    }
    return await this.finish(ctx, tokens);
  }

  async completeNative(
    ctx: Ctx,
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<CompleteResult> {
    if (this.nativeClientId.trim() === '') {
      throw internalCause(new Error('sso native client not configured'));
    }
    if (code.trim() === '' || codeVerifier.trim() === '') {
      throw badRequest('SSO native нэвтрэлт дутуу параметртэй байна');
    }
    let tokens: Tokens;
    try {
      tokens = await this.oidc.exchangePKCE(
        this.nativeClientId,
        code,
        codeVerifier,
        redirectUri,
        ctx.signal,
      );
    } catch (err) {
      throw internalCause(err);
    }
    // Native (PKCE) урсгал нь refresh_token ХАДГАЛАХГҮЙ — eID proxy нь web
    // талаас дуудагдана.
    return await this.finish(ctx, {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      refreshToken: '',
      expiresIn: tokens.expiresIn,
    });
  }

  /**
   * finish нь токен авсны дараах НИЙТЛЭГ tail — web (complete) болон native
   * (completeNative) хоёулаа хуваалцана: /userinfo → нэр/иргэний дугаар →
   * хандалтын горим → upsert → SSO токен хадгалах → JWT хос → id_token ref.
   */
  private async finish(ctx: Ctx, tokens: Tokens): Promise<CompleteResult> {
    let info;
    try {
      info = await this.oidc.userInfo(tokens.accessToken, ctx.signal);
    } catch (err) {
      throw internalCause(err);
    }

    let firstName = info.given_name.trim();
    let lastName = info.family_name.trim();
    // given/family хоосон ч name байвал бүтэн нэрийг lastName-д (fallback) тавина.
    if (firstName === '' && lastName === '' && info.name.trim() !== '') {
      lastName = info.name.trim();
      firstName = '';
    }
    const firstNameEn = info.given_name_en.trim();
    const lastNameEn = info.family_name_en.trim();

    // nationalid scope-оос иргэний дугаар (register_number = civil id) ирсэн бол
    // байгаа eID хэрэглэгчтэй civil_id-ээр тааруулна — ижил регистрээр eID болон
    // SSO-ээр нэвтрэхэд НЭГ данс болно. national_id нь eID-ийн адил жижиг үсгээр.
    const civilId = info.register_number.trim();
    const nationalId = info.national_id.trim().toLowerCase();

    const googleSub = info.google_sub.trim();
    const googleEmail = info.google_email.trim();
    const googleName = info.google_name.trim();
    const googlePicture = info.google_picture.trim();

    // Private платформын шалгуур — баталгаажсаны ДАРАА, upsert-ийн ӨМНӨ.
    // Private горимд урьдчилан бүртгээгүй иргэнийг ЭНД зогсооно (данс үүсэхгүй).
    await this.enforceAccessMode(ctx, civilId, nationalId);

    let stored: User;
    if (civilId !== '') {
      stored = await this.store.upsertByCivilID(ctx, civilId, nationalId, info.sub, {
        username: `eid_${civilId}`,
        firstName,
        lastName,
        firstNameEn,
        lastNameEn,
        email: '',
        // roleId нь ЗӨВХӨН шинэ мөрд; байгаа хэрэглэгчийн эрхийг хөндөхгүй.
        roleId: RoleUser,
        googleSub,
        googleEmail,
        googleName,
        googlePicture,
      });
    } else {
      // Иргэний дугааргүй (nationalid scope байхгүй) — pairwise sub-ээр.
      // Refresh нь email-ээр хайдаг тул синтетик email хадгална.
      const slug = subSlug(info.sub);
      stored = await this.store.upsertBySSOSub(ctx, info.sub, {
        username: `sso_${slug}`,
        firstName,
        lastName,
        firstNameEn,
        lastNameEn,
        email: `sso_${slug}@sso.local`,
        roleId: RoleUser,
        googleSub,
        googleEmail,
        googleName,
        googlePicture,
      });
    }

    // SSO OAuth токенуудыг (refresh_token-той бол) хадгална — SSO eID proxy-г
    // иргэний нэрийн өмнөөс дуудахад ашиглана. Алдаа гарвал нэвтрэлтийг
    // УНАГАХГҮЙ (proxy боломжгүй болно, бусад eID урсгал шууд ажиллана).
    if (this.tokens !== null) {
      try {
        await this.tokens.store(ctx, stored.id, tokens);
      } catch (err) {
        logger.errorWithContext(ctx, 'sso: failed to store SSO tokens (non-fatal)', {
          error: logger.errText(err),
        });
      }
    }

    let pair: TokenPair;
    try {
      pair = this.jwtService.generateTokenPair(
        stored.id,
        isAdmin(stored),
        stored.roleId,
        stored.email,
      );
    } catch (err) {
      throw internalCause(err);
    }
    await this.rememberRefresh(ctx, pair);

    // id_token-ыг БОГИНО ref-ээр Redis-д хадгална — гарах үед ref-ээр logout URL
    // (id_token_hint-тэй) байгуулна. Cookie-д зөвхөн ref (32 hex) л очно.
    let logoutRef = '';
    if (tokens.idToken !== '') {
      const ref = randomToken();
      try {
        await this.redis.setTTL(ctx, idtPrefix + ref, tokens.idToken, logoutTtlSeconds);
        logoutRef = ref;
      } catch {
        // Хадгалж чадаагүй — logout URL байгуулах боломжгүй болно, гэхдээ
        // нэвтрэлт өөрөө амжилттай.
        logoutRef = '';
      }
    }

    return {
      token: pair.access_token,
      refreshToken: pair.refresh_token,
      logoutRef,
      user: stored,
    };
  }

  /**
   * enforceAccessMode нь private платформ дээр ЗӨВХӨН админаас урьдчилан
   * бүртгэсэн иргэнийг л оруулна.
   *
   * Горим унших/шалгах DB алдаа гарвал нэвтрэлтийг тэр удаад ЗОГСООНО —
   * fail-open БИШ: баталгаагүй байдалд эрхгүй иргэнийг оруулахгүй.
   */
  private async enforceAccessMode(ctx: Ctx, civilId: string, nationalId: string): Promise<void> {
    if (this.access === null) return; // public (default)

    let mode: string;
    try {
      mode = await this.access.getAccessMode(ctx);
    } catch (err) {
      throw internalCause(err);
    }
    if (mode !== AccessModePrivate) return; // public — хэн ч нэвтэрч болно

    // Private: иргэнийг тодорхойлох дугаар байхгүй бол оруулах аргагүй.
    if (civilId === '' && nationalId === '') throw forbidden(accessDeniedMsg);

    let ok: boolean;
    try {
      ok = await this.store.authorizedByCivilOrNational(ctx, civilId, nationalId);
    } catch (err) {
      throw internalCause(err);
    }
    if (!ok) throw forbidden(accessDeniedMsg);
  }

  async logoutUrl(ctx: Ctx, ref: string): Promise<string> {
    if (ref.trim() === '') return '';
    let idToken = '';
    try {
      idToken = await this.redis.getDel(ctx, idtPrefix + ref);
    } catch {
      idToken = '';
    }
    // ref байхгүй/хугацаа дууссан — SSO-гүй эсвэл аль хэдийн гарсан.
    if (idToken === '') return '';
    return this.oidc.logoutUrlFor(idToken);
  }

  /**
   * rememberRefresh нь refresh jti-г Redis-д TTL-тэй хадгална — auth-ийн refresh
   * түлхүүрийн форматтай НИЙЦҮҮЛЖ, /auth/refresh-ийг SSO хэрэглэгчид ч
   * ажиллуулна.
   */
  private async rememberRefresh(ctx: Ctx, pair: TokenPair): Promise<void> {
    const ttlSeconds = Math.floor((pair.refresh_expires_at.getTime() - Date.now()) / 1000);
    if (ttlSeconds <= 0) throw internalCause(new Error('refresh token already expired'));
    try {
      await this.redis.setTTL(ctx, refreshKey(pair.refreshJTI), pair.refreshJTI, ttlSeconds);
    } catch (err) {
      throw internalCause(err);
    }
  }
}

/**
 * newSSOUsecase нь SSO usecase угсарна. nativeClientId нь mobile (PKCE, public
 * client) урсгалын client_id — хоосон бол native code-exchange идэвхгүй.
 * tokenStorer нь SSO eID proxy-д зориулж токен хадгалах (null бол хадгалахгүй).
 * accessMode нь платформын хандалтын горим уншигч (null бол public).
 */
export function newSSOUsecase(
  oidc: OIDCClient,
  store: SSOUserRepository,
  jwtService: JWTService,
  redis: RedisCache,
  nativeClientId: string,
  tokenStorer: SSOTokenStorer | null,
  accessMode: PlatformSettingsRepository | null,
): SSOUsecase {
  return new SSOUsecaseImpl(
    oidc,
    store,
    jwtService,
    redis,
    nativeClientId,
    tokenStorer,
    accessMode,
  );
}
