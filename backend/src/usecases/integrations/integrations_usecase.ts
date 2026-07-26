// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/integrations нь хэрэглэгчийн гуравдагч этгээдийн (Google Drive/Meet,
// Dropbox) OAuth токеныг удирдана. Токенууд storage-д AES-256-GCM-ээр
// ШИФРЛЭГДЭЖ хадгалагдана (pkg/crypto).
//
// ⚠️ Шифрлэлтийн түлхүүр (INTEGRATION_ENC_KEY) нь тохиргооны мөрөөс SHA-256-аар
// гаргагдана. Хоосон бол түлхүүр нь `sha256("")` — НИЙТЭД МЭДЭГДЭХ тогтмол утга
// болж, хадгалагдсан OAuth токенууд үнэндээ ил текстээр хэвтэнэ. Тиймээс
// production-д (requireKey=true) хоосон түлхүүрийг fail-closed-оор татгалзана.

import { badRequest, internalCause, notFound } from '../../apperror/index.js';
import type { UserIntegrationRepository } from '../../datasources/repositories/interface/user_integration.js';
import { IntegrationProviders } from '../../domain/user_integration.js';
import { Cipher } from '../../pkg/crypto/cipher.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

/** TokenData нь decrypt хийсэн токен (server-тал л авна). */
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}

/** ConnectRequest нь usecase-ийн хилийн оролт. */
export interface ConnectRequest {
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}

/** ConnectedProvider нь list-ийн буцаалт — токенГҮЙ, аюулгүй далайц. */
export interface ConnectedProvider {
  provider: string;
  expiresAt: Date | null;
  connectedAt: Date;
}

export interface IntegrationsUsecase {
  /** connect нь нэг провайдерын токеныг (шифрлээд) хадгална эсвэл шинэчилнэ. */
  connect(ctx: Ctx, req: ConnectRequest): Promise<void>;
  /** list нь холбосон провайдеруудыг буцаана (ТОКЕНГҮЙ). */
  list(ctx: Ctx, userId: string): Promise<ConnectedProvider[]>;
  /** disconnect нь нэг холболтыг устгана (идемпотент). */
  disconnect(ctx: Ctx, userId: string, provider: string): Promise<void>;
  /**
   * token нь ШИФРГҮЙ токеныг буцаана — ЗӨВХӨН server-тал провайдерын API руу
   * хандахад ашиглана; browser руу хэзээ ч гарахгүй.
   */
  token(ctx: Ctx, userId: string, provider: string): Promise<TokenData>;
}

class IntegrationsUsecaseImpl implements IntegrationsUsecase {
  constructor(
    private readonly repo: UserIntegrationRepository,
    private readonly cipher: Cipher,
  ) {}

  async connect(ctx: Ctx, req: ConnectRequest): Promise<void> {
    const provider = req.provider.trim();
    if (!IntegrationProviders.has(provider)) throw badRequest('unknown integration provider');
    if (req.accessToken.trim() === '') throw badRequest('access_token is required');

    let encAccess: string;
    let encRefresh: string;
    try {
      encAccess = this.cipher.encrypt(req.accessToken);
      encRefresh = this.cipher.encrypt(req.refreshToken);
    } catch (err) {
      throw internalCause(err);
    }

    // Буцаахдаа токеныг задлахгүй — дуудагч (handler) токен хэрэглэхгүй.
    await this.repo.upsert(ctx, {
      userId: req.userId,
      provider,
      accessToken: encAccess,
      refreshToken: encRefresh,
      expiresAt: req.expiresAt,
    });
  }

  async list(ctx: Ctx, userId: string): Promise<ConnectedProvider[]> {
    const rows = await this.repo.listByUser(ctx, userId);
    return rows.map((r) => ({
      provider: r.provider,
      expiresAt: r.expiresAt,
      connectedAt: r.createdAt,
    }));
  }

  async disconnect(ctx: Ctx, userId: string, provider: string): Promise<void> {
    if (!IntegrationProviders.has(provider.trim())) {
      throw badRequest('unknown integration provider');
    }
    await this.repo.deleteByUserAndProvider(ctx, userId, provider.trim());
  }

  async token(ctx: Ctx, userId: string, provider: string): Promise<TokenData> {
    const p = provider.trim();
    if (!IntegrationProviders.has(p)) throw badRequest('unknown integration provider');

    const rows = await this.repo.listByUser(ctx, userId);
    const row = rows.find((r) => r.provider === p);
    if (!row) throw notFound('integration not connected');

    try {
      return {
        accessToken: this.cipher.decrypt(row.accessToken),
        refreshToken: row.refreshToken === '' ? '' : this.cipher.decrypt(row.refreshToken),
        expiresAt: row.expiresAt,
      };
    } catch (err) {
      // Түлхүүр солигдсон / өгөгдөл гэмтсэн — 500, гэхдээ шалтгаан клиентэд гарахгүй.
      throw internalCause(err);
    }
  }
}

/**
 * newIntegrationsUsecase нь интеграцийн usecase-г үүсгэнэ.
 *
 * requireKey=true (production) үед хоосон түлхүүрийг ТАТГАЛЗАНА — нийтэд
 * мэдэгдэх default түлхүүрээр OAuth токен "шифрлэх" нь шифрлээгүйтэй адил.
 */
export function newIntegrationsUsecase(
  repo: UserIntegrationRepository,
  encKey: string,
  requireKey: boolean,
): IntegrationsUsecase {
  if (requireKey && encKey.trim() === '') {
    throw new Error(
      'integrations: INTEGRATION_ENC_KEY is required in production (refusing to encrypt OAuth tokens with a publicly-known default key)',
    );
  }
  return new IntegrationsUsecaseImpl(repo, new Cipher(encKey));
}
