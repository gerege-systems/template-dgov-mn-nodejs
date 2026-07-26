// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /users/me/eid/* endpoint-ууд — нэвтэрсэн иргэний eID нэмэлт мэдээлэл:
// төлөөлдөг байгууллага · тэдгээрийн гарын үсэг зурагчид · PKI самбар
// (гэрчилгээ · төхөөрөмж · үйлдлийн түүх).
//
// Бүх үйлдэл ЗӨВХӨН нэвтэрсэн хэрэглэгчийн нэрийн өмнөөс ажиллана: personEtsi-г
// JWT-ийн userId-аас (DB дэх civil_id-аар) угсардаг тул клиент өөр хүний ETSI
// дамжуулах боломжгүй.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { AuthUsecase } from '../../../../usecases/auth/auth_usecase.js';
import {
  eidActivityResponse,
  eidCertificatesResponse,
  eidDevicesResponse,
  eidSummaryResponse,
  orgRepresentationsResponse,
  orgSignersResponse,
  orgSignersResultResponse,
} from '../../../dto/responses/eid.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/** orgRegisterSchema нь байгууллага холбох body (улсын бүртгэлийн дугаар). */
const orgRegisterSchema = strictObject({
  reg_no: z.string().min(4).max(16),
});

/**
 * addSignerSchema нь зурагч нэмэх body. Нэмэгдэх эрх нь ҮРГЭЛЖ MANAGER
 * (eidmongolia талд шийдэгдэнэ) тул rightType энд байхгүй.
 */
const addSignerSchema = strictObject({
  signer_reg_no: z.string().min(8).max(20),
  role: z.string().max(100).optional(),
});

/** regNoParam нь :regNo path параметрийг мөр болгоно. */
function regNoParam(req: Request): string {
  const raw: unknown = req.params.regNo;
  return typeof raw === 'string' ? raw : '';
}

/** queryString нь query параметрийг мөр болгоно (массив/undefined → ""). */
function queryString(req: Request, key: string): string {
  const raw: unknown = req.query[key];
  return typeof raw === 'string' ? raw : '';
}

/** parseIntDefault нь query-г бүхэл тоо болгоно; буруу бол өгөгдмөл. */
function parseIntDefault(req: Request, key: string, def: number): number {
  const raw: unknown = req.query[key];
  if (typeof raw !== 'string' || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

export class EidProfileHandler {
  constructor(private readonly usecase: AuthUsecase) {}

  /**
   * organizations нь иргэний төлөөлдөг байгууллагуудыг буцаана. eID-ээр
   * нэвтрээгүй хэрэглэгчид ХООСОН жагсаалт (алдаа биш) — Google-ээр нэвтэрсэн
   * хэрэглэгчийн профайл хуудас эвдрэхгүй.
   *
   * GET /users/me/eid/organizations · Bearer · 200
   */
  organizations: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const reps = await this.usecase.eidRepresentations(req.ctx, user.id);
    newSuccessResponse(
      req,
      res,
      200,
      'eid organizations fetched',
      orgRepresentationsResponse(reps),
    );
  };

  /**
   * addOrganization нь улсын бүртгэлээс (XYP) байгууллагыг хайж, иргэнийг
   * төлөөлөл болгон холбоно. Эрхийн шалгалт eidmongolia талд — иргэний РД нь
   * захирал/үүсгэн байгуулагч/хувь эзэмшигчийн жагсаалтад байх ёстой.
   *
   * POST /users/me/eid/organizations · Bearer + write limit · 200 · 403 · 404
   */
  addOrganization: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, orgRegisterSchema);
    const reps = await this.usecase.registerEidOrganization(req.ctx, user.id, body.reg_no);
    newSuccessResponse(req, res, 200, 'eid organization linked', orgRepresentationsResponse(reps));
  };

  /** DELETE /users/me/eid/organizations/:regNo · Bearer + write limit · 200 · 403 */
  removeOrganization: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const reps = await this.usecase.unlinkEidOrganization(req.ctx, user.id, regNoParam(req));
    newSuccessResponse(
      req,
      res,
      200,
      'eid organization unlinked',
      orgRepresentationsResponse(reps),
    );
  };

  /** GET /users/me/eid/organizations/:regNo/signers · Bearer · 200 · 403 */
  orgSigners: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const signers = await this.usecase.listEidOrgSigners(req.ctx, user.id, regNoParam(req));
    newSuccessResponse(req, res, 200, 'eid org signers fetched', orgSignersResponse(signers));
  };

  /**
   * addOrgSigner нь өөр eID иргэнийг MANAGER эрхтэй зурагч болгож нэмнэ. Тэр
   * хүн рүү sign-push илгээгдэж, ӨӨРӨӨ PIN-ээрээ баталгаажуулах хүртэл
   * төлөөлөл нь PENDING (хүчингүй) хэвээр — нэг талын нэмэлт болохгүй.
   *
   * POST /users/me/eid/organizations/:regNo/signers · Bearer + write · 200 · 403 · 404
   */
  addOrgSigner: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, addSignerSchema);
    const result = await this.usecase.addEidOrgSigner(
      req.ctx,
      user.id,
      regNoParam(req),
      body.signer_reg_no,
      body.role ?? '',
    );
    newSuccessResponse(req, res, 200, 'eid org signer added', orgSignersResultResponse(result));
  };

  /** POST /users/me/eid/organizations/:regNo/signers/resend?signer= · Bearer + write · 200 */
  resendOrgSigner: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const result = await this.usecase.resendEidOrgSigner(
      req.ctx,
      user.id,
      regNoParam(req),
      queryString(req, 'signer'),
    );
    newSuccessResponse(
      req,
      res,
      200,
      'eid org signer confirmation resent',
      orgSignersResultResponse(result),
    );
  };

  /** DELETE /users/me/eid/organizations/:regNo/signers?signer= · Bearer + write · 200 */
  removeOrgSigner: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const signers = await this.usecase.removeEidOrgSigner(
      req.ctx,
      user.id,
      regNoParam(req),
      queryString(req, 'signer'),
    );
    newSuccessResponse(req, res, 200, 'eid org signer removed', orgSignersResponse(signers));
  };

  /**
   * summary нь PKI самбарын нэгдсэн тоог буцаана. RP-д PKI_READ эрх
   * олгогдоогүй бол 403 — клиент "эрх хүлээгдэж байна" гэж харуулна.
   *
   * GET /users/me/eid/summary · Bearer · 200 · 403
   */
  summary: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const out = await this.usecase.eidSummary(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'eid summary fetched', eidSummaryResponse(out));
  };

  /** GET /users/me/eid/certificates · Bearer · 200 · 403 */
  certificates: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const out = await this.usecase.eidCertificates(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'eid certificates fetched', eidCertificatesResponse(out));
  };

  /** GET /users/me/eid/devices · Bearer · 200 · 403 */
  devices: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const out = await this.usecase.eidDevices(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'eid devices fetched', eidDevicesResponse(out));
  };

  /** GET /users/me/eid/activity?limit&offset · Bearer · 200 · 403 */
  activity: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const out = await this.usecase.eidActivity(
      req.ctx,
      user.id,
      parseIntDefault(req, 'limit', 20),
      parseIntDefault(req, 'offset', 0),
    );
    newSuccessResponse(req, res, 200, 'eid activity fetched', eidActivityResponse(out));
  };
}

export const newEidProfileHandler = (usecase: AuthUsecase): EidProfileHandler =>
  new EidProfileHandler(usecase);
