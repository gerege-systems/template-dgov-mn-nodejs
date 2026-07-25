// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/core нь Gerege Core (core.gerege.mn)-ийн USER FIND / ORG FIND
// үйлчилгээг wrap хийнэ. Core-ийн хариуг дамжуулна (pass-through).

import type { Ctx } from '../../pkg/ctx/ctx.js';

export interface CoreUsecase {
  /**
   * findUsers нь core.gerege.mn /api/user/find руу searchText-ээр хайна
   * (core_id эсвэл регистрийн дугаар). Core-ийн хариуг задалсан хэлбэрээр
   * буцаана (дамжуулна).
   */
  findUsers(ctx: Ctx, searchText: string): Promise<unknown>;
  /** findOrganizations нь core.gerege.mn /api/organization/find руу хайна. */
  findOrganizations(ctx: Ctx, searchText: string): Promise<unknown>;
}
