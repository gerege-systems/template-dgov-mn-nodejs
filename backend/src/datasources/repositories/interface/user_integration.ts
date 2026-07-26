// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { UserIntegration } from '../../../domain/user_integration.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/** NewUserIntegration нь upsert-д шаардлагатай талбарууд (токен ШИФРЛЭГДСЭН). */
export interface NewUserIntegration {
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}

/**
 * UserIntegrationRepository нь user_integrations хүснэгтийн gateway.
 * Хэрэглэгч-тус-бүрийн МЭДРЭМТГИЙ өгөгдөл тул query бүр RLS-тэй ажиллана.
 */
export interface UserIntegrationRepository {
  upsert(ctx: Ctx, input: NewUserIntegration): Promise<UserIntegration>;
  listByUser(ctx: Ctx, userId: string): Promise<UserIntegration[]>;
  deleteByUserAndProvider(ctx: Ctx, userId: string, provider: string): Promise<void>;
}
