// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /users/* HTTP endpoint-ууд — баталгаажуулагдсан хэрэглэгчийн ӨӨРИЙНХ НЬ
// профайл / өгөгдөлд хамаарах бүх зүйл. Auth урсгалууд нь ах дүү модуль
// handlers/v1/auth-д байрладаг.

import * as logger from '../../../../pkg/logger/logger.js';
import type { UsersUsecase } from '../../../../usecases/users/users_usecase.js';
import { userResponseFromDomain } from '../../../dto/responses/user.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { newErrorResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler } from '../../../types.js';

const controllerName = 'users';
const fileName = 'users_handler.ts';

/**
 * UsersHandler нь user-домэйн endpoint-уудыг үйлчилнэ. Энэ нь ЗӨВХӨН
 * UsersUsecase руу дууддаг — хэзээ ч repository руу шууд дууддаггүй.
 */
export class UsersHandler {
  constructor(
    private readonly usecase: UsersUsecase,
    /**
     * eidProxyEnabled нь SSO eID proxy тохируулагдсан эсэх — /me хариунд
     * eid_proxy болгон буцаж, frontend eID хуудсуудыг SSO хэрэглэгчид нээнэ.
     */
    private readonly eidProxyEnabled: boolean,
  ) {}

  /**
   * getUserData нь Authorization header дахь JWT-ээс баталгаажуулагдсан
   * хэрэглэгчийг уншиж, тохирох бичлэгийг буцаана.
   *
   * GET /users/me · Bearer · 200 UserResponse · 401 · 404
   */
  getUserData: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      logger.warnWithContext(req.ctx, 'getUserData: not authenticated', {
        controller: controllerName,
        method: 'getUserData',
        file: fileName,
        error: 'request is not authenticated',
      });
      newErrorResponse(req, res, 401, 'request is not authenticated');
      return;
    }

    // Хэрэглэгчийг тогтвортой primary key (JWT-ийн UserID)-аар хайна — email-ээр
    // БИШ. eID-ээр нэвтэрсэн хэрэглэгчид email-гүй (national_id/civil_id
    // түлхүүртэй) тул email-ээр хайвал "user not found" болж /me хуудас цагаан
    // гацна.
    const found = await this.usecase.getById(req.ctx, { id: user.id });

    const userResp = userResponseFromDomain(found.user);
    if (this.eidProxyEnabled) userResp.eid_proxy = true;
    newSuccessResponse(req, res, 200, 'user data fetched successfully', { user: userResp });
  };
}

export function newUsersHandler(usecase: UsersUsecase, eidProxyEnabled: boolean): UsersHandler {
  return new UsersHandler(usecase, eidProxyEnabled);
}
