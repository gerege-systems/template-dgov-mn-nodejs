// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /org/* endpoint-ууд — байгууллага болон гишүүнчлэл. Бүгд нэвтрэлт шаардана;
// ЭРХ ОЛГОЛТ (owner/admin эсэх) нь usecase давхаргад — handler нь дуудагчийн
// ID-г ЗӨВХӨН JWT-ээс авч дамжуулна (body-гоор callerId дамжуулах боломжгүй).

import { z } from 'zod';

import { OrgRole } from '../../../../domain/org.js';
import { strictObject } from '../../../../pkg/validators/validators.js';
import * as logger from '../../../../pkg/logger/logger.js';
import { recordEventSafely, type AuditUsecase } from '../../../../usecases/audit/audit_usecase.js';
import type { OrgUsecase } from '../../../../usecases/org/org_usecase.js';
import {
  orgListResponse,
  orgMemberListResponse,
  orgMemberResponse,
  orgResponse,
} from '../../../dto/responses/org.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

const orgRoleEnum = z.enum([OrgRole.Owner, OrgRole.Admin, OrgRole.Member]);

const createOrgSchema = strictObject({
  reg_no: z.string().min(1).max(40),
  name: z.string().min(2).max(200),
  name_latin: z.string().max(200).optional(),
});

/** addMemberSchema — role хоосон бол 'member' болж өгөгдмөлднө (usecase шийднэ). */
const addMemberSchema = strictObject({
  user_id: z.string().uuid(),
  role: orgRoleEnum.optional(),
});

const updateMemberRoleSchema = strictObject({
  role: orgRoleEnum,
});

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

export class OrgHandler {
  constructor(
    private readonly usecase: OrgUsecase,
    /**
     * auditUC нь org үйл явдлыг (үүсгэх, гишүүн нэмэх/хасах) hash-chained
     * бүртгэлд best-effort бичнэ. null бол audit алгасагдана.
     */
    private readonly auditUC: AuditUsecase | null,
  ) {}

  /** POST /org · Bearer · 201 · 400 · 409 · 422 */
  createOrganization: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, createOrgSchema);
    const org = await this.usecase.createOrganization(req.ctx, {
      callerId: user.id,
      regNo: body.reg_no,
      name: body.name,
      nameLatin: body.name_latin ?? '',
    });
    await this.audit(req, 'org.create', org.id, { reg_no: org.regNo });
    newSuccessResponse(req, res, 201, 'organization created successfully', orgResponse(org));
  };

  /** GET /org · Bearer · 200 */
  listMyOrganizations: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const list = await this.usecase.listMyOrganizations(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'organizations fetched successfully', orgListResponse(list));
  };

  /** GET /org/lookup/:regNo · Bearer · 200 · 404 */
  lookupByRegNo: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const org = await this.usecase.lookupByRegNo(req.ctx, pathParam(req, 'regNo'));
    newSuccessResponse(req, res, 200, 'organization fetched successfully', orgResponse(org));
  };

  /** GET /org/:id · Bearer · 200 · 404 (гишүүн биш бол ч мөн 404) */
  getOrganization: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const org = await this.usecase.getOrganization(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'organization fetched successfully', orgResponse(org));
  };

  /** GET /org/:id/members · Bearer · 200 · 403 */
  listMembers: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const members = await this.usecase.listMembers(req.ctx, user.id, pathParam(req, 'id'));
    newSuccessResponse(
      req,
      res,
      200,
      'members fetched successfully',
      orgMemberListResponse(members),
    );
  };

  /** POST /org/:id/members · Bearer · 201 · 403 · 409 · 422 */
  addMember: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const orgId = pathParam(req, 'id');
    const body = decodeBody(req, addMemberSchema);
    const membership = await this.usecase.addMember(req.ctx, {
      callerId: user.id,
      orgId,
      userId: body.user_id,
      role: body.role ?? '',
    });
    await this.audit(req, 'org.member.add', orgId, {
      member_user_id: membership.userId,
      role: membership.role,
    });
    newSuccessResponse(req, res, 201, 'member added successfully', orgMemberResponse(membership));
  };

  /** PUT /org/:id/members/:userID · Bearer · 200 · 400 · 403 · 404 · 422 */
  updateMemberRole: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, updateMemberRoleSchema);
    await this.usecase.updateMemberRole(req.ctx, {
      callerId: user.id,
      orgId: pathParam(req, 'id'),
      userId: pathParam(req, 'userID'),
      role: body.role,
    });
    newSuccessResponse(req, res, 200, 'member role updated successfully');
  };

  /** DELETE /org/:id/members/:userID · Bearer · 200 · 400 · 403 · 404 */
  removeMember: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const orgId = pathParam(req, 'id');
    const userID = pathParam(req, 'userID');
    await this.usecase.removeMember(req.ctx, { callerId: user.id, orgId, userId: userID });
    await this.audit(req, 'org.member.remove', orgId, { member_user_id: userID });
    newSuccessResponse(req, res, 200, 'member removed successfully');
  };

  /**
   * audit нь org үйл явдлыг best-effort бичнэ — бүртгэл амжилтгүй болсон нь
   * хэрэглэгчийн үйлдлийг ХЭЗЭЭ Ч бүтэлгүйтүүлэхгүй.
   */
  private async audit(
    req: Request,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await recordEventSafely(this.auditUC, req.ctx, action, 'org', target, metadata, (err) => {
      logger.errorWithContext(req.ctx, 'org audit write failed', {
        controller: 'org',
        action,
        error: logger.errText(err),
      });
    });
  }
}

export const newOrgHandler = (usecase: OrgUsecase, auditUC: AuditUsecase | null): OrgHandler =>
  new OrgHandler(usecase, auditUC);
