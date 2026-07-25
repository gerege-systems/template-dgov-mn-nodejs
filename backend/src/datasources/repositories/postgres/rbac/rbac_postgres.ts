// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// roles / permissions / role_permissions хүснэгтүүдийн Postgres gateway.
//
// Эдгээр нь хэрэглэгч-тус-бүрийн БИШ лавлах өгөгдөл тул Row-Level Security-д
// хамаарахгүй — жирийн pool query-ээр уншина. Цорын ганц онцгой тохиолдол нь
// countUsersWithRole: RLS-тэй `users` хүснэгтэд хүрдэг тул "service" identity
// дор транзакцид ажиллана.

import {
  badRequest,
  conflict,
  DomainError,
  internalCause,
  notFound,
} from '../../../../apperror/index.js';
import type { Permission, Role } from '../../../../domain/rbac.js';
import { withService, type Ctx } from '../../../../pkg/ctx/ctx.js';
import {
  PgForeignKeyViolation,
  isUniqueViolation,
  pgErrorCode,
  type Db,
} from '../../../drivers/pg.js';
import type { RBACRepository } from '../../interface/rbac.js';

const roleColumns = 'id, key, name, description, is_system, created_at, updated_at';

/** RoleRow нь roles хүснэгтийн мөр (баганы нэрстэй яг таарна). */
interface RoleRow {
  id: number;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: Date;
  updated_at: Date | null;
}

interface PermissionRow {
  key: string;
  label: string;
  category: string;
}

const toRole = (r: RoleRow): Role => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description,
  isSystem: r.is_system,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

class PostgresRBACRepository implements RBACRepository {
  constructor(private readonly db: Db) {}

  async listRoles(ctx: Ctx): Promise<Role[]> {
    try {
      const res = await this.db.query<RoleRow>(ctx, `SELECT ${roleColumns} FROM roles ORDER BY id`);
      return res.rows.map(toRole);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getRole(ctx: Ctx, id: number): Promise<Role> {
    let row: RoleRow | undefined;
    try {
      const res = await this.db.query<RoleRow>(
        ctx,
        `SELECT ${roleColumns} FROM roles WHERE id = $1`,
        [id],
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('role not found');
    return toRole(row);
  }

  async createRole(ctx: Ctx, input: Pick<Role, 'key' | 'name' | 'description'>): Promise<Role> {
    try {
      const res = await this.db.query<RoleRow>(
        ctx,
        `INSERT INTO roles(key, name, description, is_system) VALUES ($1,$2,$3,false) RETURNING ${roleColumns}`,
        [input.key, input.name, input.description],
      );
      const row = res.rows[0];
      if (!row) throw internalCause(new Error('insert succeeded but RETURNING produced no row'));
      return toRole(row);
    } catch (err) {
      if (err instanceof DomainError) throw err;
      if (isUniqueViolation(err)) throw conflict('role key already exists');
      throw internalCause(err);
    }
  }

  /** updateRole нь ЗӨВХӨН name/description-г шинэчилнэ; key болон is_system хөндөгдөхгүй. */
  async updateRole(ctx: Ctx, input: Pick<Role, 'id' | 'name' | 'description'>): Promise<Role> {
    let row: RoleRow | undefined;
    try {
      const res = await this.db.query<RoleRow>(
        ctx,
        `UPDATE roles SET name = $2, description = $3, updated_at = now() WHERE id = $1 RETURNING ${roleColumns}`,
        [input.id, input.name, input.description],
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('role not found');
    return toRole(row);
  }

  /** deleteRole нь системийн эрхийг (admin/manager/user) устгуулахгүй. */
  async deleteRole(ctx: Ctx, id: number): Promise<void> {
    let rowCount = 0;
    try {
      const res = await this.db.query(
        ctx,
        `DELETE FROM roles WHERE id = $1 AND is_system = false`,
        [id],
      );
      rowCount = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (rowCount === 0) throw conflict('role not found or is a system role');
  }

  /**
   * countUsersWithRole нь "service" RLS identity дор тоолно — `users` нь RLS-тэй
   * тул жирийн app role 0 мөр хардаг бөгөөд тэр үед ашиглагдаж буй эрх
   * "хэрэглэгчгүй" мэт харагдаж алдаатай устгагдана.
   */
  async countUsersWithRole(ctx: Ctx, roleId: number): Promise<number> {
    try {
      return await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query<{ count: string }>(
          `SELECT count(*) AS count FROM users WHERE role_id = $1 AND deleted_at IS NULL`,
          [roleId],
        );
        // Postgres-ийн count(*) нь bigint тул драйвер мөрөөр буцаана.
        return Number.parseInt(res.rows[0]?.count ?? '0', 10);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async listPermissions(ctx: Ctx): Promise<Permission[]> {
    try {
      const res = await this.db.query<PermissionRow>(
        ctx,
        `SELECT key, label, category FROM permissions ORDER BY category, key`,
      );
      return res.rows.map((p) => ({ key: p.key, label: p.label, category: p.category }));
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getRolePermissions(ctx: Ctx, roleId: number): Promise<string[]> {
    try {
      const res = await this.db.query<{ permission_key: string }>(
        ctx,
        `SELECT permission_key FROM role_permissions WHERE role_id = $1 ORDER BY permission_key`,
        [roleId],
      );
      return res.rows.map((r) => r.permission_key);
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * setRolePermissions нь эрхийн багцыг БҮХЭЛД НЬ солино — нэг транзакцид
   * хуучныг устгаж, шинийг оруулна. Каталогт байхгүй түлхүүр нь FK зөрчил
   * (23503) болж 400 болно.
   */
  async setRolePermissions(ctx: Ctx, roleId: number, keys: string[]): Promise<void> {
    try {
      await this.db.withTx(ctx, async (tx) => {
        await tx.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
        for (const k of keys) {
          try {
            await tx.query(
              `INSERT INTO role_permissions(role_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [roleId, k],
            );
          } catch (err) {
            if (pgErrorCode(err) === PgForeignKeyViolation) {
              throw badRequest(`unknown permission key: ${k}`);
            }
            throw err;
          }
        }
      });
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }
  }
}

export function newRBACRepository(db: Db): RBACRepository {
  return new PostgresRBACRepository(db);
}
