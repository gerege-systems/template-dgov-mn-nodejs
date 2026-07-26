// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/ssotoken нь иргэний SSO OAuth токенуудыг хадгалж, хэрэгцээт үед (SSO
// eID proxy дуудахад) ХҮЧИНТЭЙ access token-ыг буцаана — хугацаа дуусах дөхсөн
// бол refresh_token-оор шинэчилнэ (offline_access scope шаардана).

import type { SSOTokenRepository } from '../../datasources/repositories/interface/ssotoken.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';
import type { OIDCClient, Tokens } from '../../pkg/oidc/oidc.js';
import type { SSOTokenService } from '../auth/auth_usecase.js';

/**
 * refreshSkewMs нь access token дуусахаас хэр өмнө урьдчилан refresh хийхийг
 * заана — сүлжээ/цагийн зөрүүнд тэсвэртэй байхын тулд.
 */
const refreshSkewMs = 60_000;

export interface SSOTokenUsecase extends SSOTokenService {
  /**
   * store нь нэвтрэлтийн дараа токенуудыг хадгална. refresh_token хоосон бол
   * (offline_access аваагүй / native урсгал) ХАДГАЛАХГҮЙ — refresh боломжгүй тул
   * хадгалсан ч ашиггүй, зөвхөн эрсдэл нэмнэ.
   */
  store(ctx: Ctx, userId: string, tokens: Tokens): Promise<void>;
}

/** expiryFrom нь expires_in (секунд)-ээс дуусах агшинг гаргана. */
function expiryFrom(expiresIn: number): Date {
  // 0 буюу сөрөг бол ОДОО — даруй refresh хийлгэнэ.
  if (expiresIn <= 0) return new Date();
  return new Date(Date.now() + expiresIn * 1000);
}

class SSOTokenUsecaseImpl implements SSOTokenUsecase {
  constructor(
    private readonly repo: SSOTokenRepository,
    private readonly oidc: OIDCClient,
  ) {}

  async store(ctx: Ctx, userId: string, tokens: Tokens): Promise<void> {
    if (tokens.refreshToken === '') return;
    await this.repo.upsert(ctx, userId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: expiryFrom(tokens.expiresIn),
    });
  }

  async validAccessToken(ctx: Ctx, userId: string): Promise<string> {
    // ErrSSOTokenNotFound-ыг дуудагч руу ДАМЖУУЛНА (тэр 401 болгоно).
    const stored = await this.repo.get(ctx, userId);
    if (stored.accessExpiresAt.getTime() - Date.now() > refreshSkewMs) {
      return stored.accessToken;
    }

    // Хугацаа дуусах дөхсөн — refresh.
    const refreshed = await this.oidc.refresh(stored.refreshToken, ctx.signal);
    try {
      await this.repo.upsert(ctx, userId, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        accessExpiresAt: expiryFrom(refreshed.expiresIn),
      });
    } catch (err) {
      // Хадгалж чадаагүй ч дуудлагыг НЭГ УДАА гүйцээхийн тулд шинэ токеныг
      // буцаана (дараагийн удаа дахин refresh хийнэ).
      logger.errorWithContext(ctx, 'ssotoken: failed to persist refreshed token (non-fatal)', {
        error: logger.errText(err),
      });
    }
    return refreshed.accessToken;
  }
}

export const newSSOTokenUsecase = (repo: SSOTokenRepository, oidc: OIDCClient): SSOTokenUsecase =>
  new SSOTokenUsecaseImpl(repo, oidc);
