// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /core/* endpoint-ууд — Gerege Core (core.gerege.mn) USER FIND / ORG FIND-ийн
// wrapper. Бүгд нэвтрэлт + `users.manage` эрх шаардана (route_core.ts-ийг үз).

import type { CoreUsecase } from '../../../../usecases/core/core_usecase.js';
import { newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/** searchTextParam нь ?search_text query-г мөр болгоно (массив/undefined → ""). */
function searchTextParam(req: Request): string {
  const raw: unknown = req.query.search_text;
  return typeof raw === 'string' ? raw : '';
}

export class CoreHandler {
  constructor(private readonly usecase: CoreUsecase) {}

  /**
   * findUsers нь Core-оос иргэнийг core_id/регистрээр хайна.
   *
   * GET /core/users?search_text=... · Bearer + users.manage · 200
   */
  findUsers: AsyncHandler = async (req, res) => {
    const data = await this.usecase.findUsers(req.ctx, searchTextParam(req));
    newSuccessResponse(req, res, 200, 'users fetched successfully', data);
  };

  /**
   * findOrganizations нь Core-оос байгууллагыг регистр/нэрээр хайна.
   *
   * GET /core/organizations?search_text=... · Bearer + users.manage · 200
   */
  findOrganizations: AsyncHandler = async (req, res) => {
    const data = await this.usecase.findOrganizations(req.ctx, searchTextParam(req));
    newSuccessResponse(req, res, 200, 'organizations fetched successfully', data);
  };
}

export const newCoreHandler = (usecase: CoreUsecase): CoreHandler => new CoreHandler(usecase);
