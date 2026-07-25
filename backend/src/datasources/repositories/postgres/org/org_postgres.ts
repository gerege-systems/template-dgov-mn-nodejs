// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// organizations + organization_memberships хүснэгтүүдийн Postgres gateway.
//
// Хоёр хүснэгт хоёулаа RLS-тэй (migration 14):
//   • УНШИЛТУУД дуудагчийн identity дор явж, гишүүнчлэлд суурилсан харагдах
//     байдлыг хүндэтгэнэ (гишүүн биш org дээр NotFound).
//   • БИЧИЛТҮҮД (org/membership үүсгэх, дүр солих, хасах) "service" GUC дор
//     явна — шинэ org үүсгэх агшинд хэрэглэгч хараахан гишүүн болоогүй тул user
//     policy түүнийг хардаггүй; бизнесийн эрхийг (owner/admin) usecase давхарга
//     аль хэдийн шалгасан байдаг.
//   • getMembership нь МӨН "service" дор — дуудагч эрхээ шалгуулахын тулд
//     өөрийн гишүүнчлэлээ найдвартай уншиж чадах ёстой.

import { conflict, DomainError, internalCause, notFound } from '../../../../apperror/index.js';
import type { Organization, OrganizationMembership } from '../../../../domain/org.js';
import { OrgRole } from '../../../../domain/org.js';
import { withService, type Ctx } from '../../../../pkg/ctx/ctx.js';
import { isUniqueViolation, pgErrorCode, type Db } from '../../../drivers/pg.js';
import type { NewMembership, NewOrganization, OrgRepository } from '../../interface/org.js';

const orgColumns = 'id, reg_no, name, name_latin, created_by, created_at, updated_at';
const membershipColumns = 'org_id, user_id, role, created_at';

interface OrgRow {
  id: string;
  reg_no: string;
  name: string;
  name_latin: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date | null;
}

interface MembershipRow {
  org_id: string;
  user_id: string;
  role: string;
  created_at: Date;
}

const toOrg = (r: OrgRow): Organization => ({
  id: r.id,
  regNo: r.reg_no,
  name: r.name,
  nameLatin: r.name_latin ?? '',
  createdBy: r.created_by ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toMembership = (r: MembershipRow): OrganizationMembership => ({
  orgId: r.org_id,
  userId: r.user_id,
  role: r.role,
  createdAt: r.created_at,
});

class OrgPostgres implements OrgRepository {
  constructor(private readonly db: Db) {}

  async createOrg(ctx: Ctx, input: NewOrganization): Promise<Organization> {
    try {
      return await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query<OrgRow>(
          `INSERT INTO organizations (reg_no, name, name_latin, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING ${orgColumns}`,
          [input.regNo, input.name, input.nameLatin, input.createdBy],
        );
        const stored = res.rows[0];
        if (!stored) throw new Error('create org: no row returned');
        // Үүсгэгч автоматаар owner гишүүн болно — ижил транзакцид, тиймээс
        // "эзэнгүй байгууллага" төлөв хэзээ ч үүсэхгүй.
        await tx.query(
          `INSERT INTO organization_memberships (org_id, user_id, role) VALUES ($1, $2, $3)`,
          [stored.id, input.createdBy, OrgRole.Owner],
        );
        return toOrg(stored);
      });
    } catch (err) {
      // reg_no давхцал → 409 (5xx биш): оператор дахин бүртгэх гэж оролдсон.
      if (isUniqueViolation(err)) {
        throw conflict('organization with this registration number already exists');
      }
      throw internalCause(err);
    }
  }

  async getOrgById(ctx: Ctx, id: string): Promise<Organization> {
    // Дуудагчийн identity дор — энгийн хэрэглэгч зөвхөн гишүүн болсон org-оо
    // хардаг тул "байхгүй" ба "эрхгүй" хоёр НЭГ ижил 404 болно (нууцлал).
    let res;
    try {
      res = await this.db.withRLS(ctx, (tx) =>
        tx.query<OrgRow>(
          `SELECT ${orgColumns} FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
          [id],
        ),
      );
    } catch (err) {
      // uuid биш текст (22P02) нь 500 биш, "олдсонгүй".
      if (isInvalidUuid(err)) throw notFound('organization not found');
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('organization not found');
    return toOrg(row);
  }

  async getOrgByRegNo(ctx: Ctx, regNo: string): Promise<Organization> {
    let res;
    try {
      res = await this.db.withRLS(ctx, (tx) =>
        tx.query<OrgRow>(
          `SELECT ${orgColumns} FROM organizations
            WHERE lower(reg_no) = lower($1) AND deleted_at IS NULL`,
          [regNo],
        ),
      );
    } catch (err) {
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('organization not found');
    return toOrg(row);
  }

  async listOrgsForUser(ctx: Ctx, userId: string): Promise<Organization[]> {
    try {
      // "service" дор: userId нь дуудагчтай заавал таарахгүй (admin өөр
      // хэрэглэгчийн жагсаалт авч болзошгүй) тул membership-ийг JOIN-оор шүүнэ.
      return await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query<OrgRow>(
          `SELECT o.id, o.reg_no, o.name, o.name_latin, o.created_by, o.created_at, o.updated_at
             FROM organizations o
             JOIN organization_memberships m ON m.org_id = o.id
            WHERE m.user_id = $1 AND o.deleted_at IS NULL
            ORDER BY o.created_at DESC`,
          [userId],
        );
        return res.rows.map(toOrg);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getMembership(ctx: Ctx, orgId: string, userId: string): Promise<OrganizationMembership> {
    let res;
    try {
      res = await this.db.withRLS(withService(ctx), (tx) =>
        tx.query<MembershipRow>(
          `SELECT ${membershipColumns} FROM organization_memberships
            WHERE org_id = $1 AND user_id = $2`,
          [orgId, userId],
        ),
      );
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('membership not found');
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('membership not found');
    return toMembership(row);
  }

  async listMembers(ctx: Ctx, orgId: string): Promise<OrganizationMembership[]> {
    try {
      // Дуудагчийн identity дор — зөвхөн өөрөө гишүүн болсон org-ийн гишүүдийг
      // харна (usecase давхарга бас гишүүнчлэлийг шалгадаг: гүн хамгаалалт).
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<MembershipRow>(
          `SELECT ${membershipColumns} FROM organization_memberships
            WHERE org_id = $1 ORDER BY created_at`,
          [orgId],
        );
        return res.rows.map(toMembership);
      });
    } catch (err) {
      if (isInvalidUuid(err)) return [];
      throw internalCause(err);
    }
  }

  async addMember(ctx: Ctx, input: NewMembership): Promise<OrganizationMembership> {
    try {
      return await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query<MembershipRow>(
          `INSERT INTO organization_memberships (org_id, user_id, role)
           VALUES ($1, $2, $3)
           RETURNING ${membershipColumns}`,
          [input.orgId, input.userId, input.role],
        );
        const row = res.rows[0];
        if (!row) throw new Error('add member: no row returned');
        return toMembership(row);
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict('user is already a member of this organization');
      }
      // FK зөрчил (байхгүй user/org) нь 500 биш, ойлгомжтой 404.
      if (pgErrorCode(err) === '23503') throw notFound('organization or user not found');
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }
  }

  async updateMemberRole(ctx: Ctx, orgId: string, userId: string, role: string): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query(
          `UPDATE organization_memberships SET role = $3 WHERE org_id = $1 AND user_id = $2`,
          [orgId, userId, role],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('membership not found');
  }

  async removeMember(ctx: Ctx, orgId: string, userId: string): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query(
          `DELETE FROM organization_memberships WHERE org_id = $1 AND user_id = $2`,
          [orgId, userId],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('membership not found');
  }
}

/**
 * isInvalidUuid нь Postgres-ийн 22P02 (invalid_text_representation) кодыг таана
 * — path-аас ирсэн uuid биш мөр 500 биш, "олдсонгүй" болох ёстой.
 */
function isInvalidUuid(err: unknown): boolean {
  return pgErrorCode(err) === '22P02';
}

export const newOrgRepository = (db: Db): OrgRepository => new OrgPostgres(db);
