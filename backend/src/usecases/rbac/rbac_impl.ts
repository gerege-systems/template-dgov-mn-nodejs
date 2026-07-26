// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { badRequest, conflict, DomainError, internalCause } from '../../apperror/index.js';
import type { RBACRepository } from '../../datasources/repositories/interface/rbac.js';
import type { Permission, Role } from '../../domain/rbac.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';
import type {
  CreateRoleRequest,
  RBACUsecase,
  RoleWithPerms,
  UpdateRoleRequest,
} from './rbac_usecase.js';

const adminRoleKey = 'admin';
const superAdminRoleKey = 'superadmin';

/**
 * cacheTTLMs нь resolve-ийн кэшийн нас. Бичих үед ШУУД invalidate хийдэг тул энэ
 * нь зөвхөн ховор race-ийн (жишээ нь олон api instance) хуучирсан бичлэгийг
 * өөрөө эдгээх хамгаалалт.
 *
 * АНХААР: кэш нь ПРОЦЕССИЙН дотор — хэд хэдэн api контейнер ажиллаж байвал нэг
 * дээрх бичилт нөгөөгийн кэшийг цэвэрлэхгүй. Тиймээс TTL нь богино (60с) бөгөөс
 * эрх хасалт бусад instance-д хүртэл нэг минут хүлээнэ.
 */
const cacheTTLMs = 60_000;

interface CacheEntry {
  keys: string[];
  expMs: number;
}

/**
 * mapRepoError нь repository-ийн DomainError-уудыг ХАДГАЛЖ, түүхий алдааг дотоод
 * алдаагаар боодог.
 */
function mapRepoError(err: unknown, op: string): unknown {
  if (err instanceof DomainError) return err;
  return internalCause(new Error(`${op}: ${logger.errText(err)}`));
}

/**
 * slugifyKey нь эрхийн түлхүүрийг үүсгэнэ — key хоосон бол name-ээс гарган,
 * жижиг үсэг + alnum/_ болгоно (жишээ нь "Sales Manager" → "sales_manager").
 */
export function slugifyKey(key: string, name: string): string {
  let s = key.trim();
  if (s === '') s = name;
  s = s.trim().toLowerCase();

  let out = '';
  let prevUnderscore = false;
  for (const ch of s) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) {
      out += ch;
      prevUnderscore = false;
    } else if (ch === '_' || ch === '-' || ch === ' ') {
      if (!prevUnderscore && out.length > 0) {
        out += '_';
        prevUnderscore = true;
      }
    }
    // Бусад тэмдэгт (кирилл, punctuation) БҮРЭН хасагдана — Go хувилбартай ижил.
  }
  return out.replace(/^_+|_+$/g, '');
}

class RBACUsecaseImpl implements RBACUsecase {
  private readonly cache = new Map<number, CacheEntry>();

  constructor(
    private readonly repo: RBACRepository,
    /** now нь тестүүдэд цагийг царцуулах боломж (кэшийн TTL шалгах). */
    private readonly now: () => number = () => Date.now(),
  ) {}

  private invalidate(roleId: number): void {
    this.cache.delete(roleId);
  }

  async listRoles(ctx: Ctx): Promise<RoleWithPerms[]> {
    let roles: Role[];
    try {
      roles = await this.repo.listRoles(ctx);
    } catch (err) {
      throw mapRepoError(err, 'list roles');
    }
    const out: RoleWithPerms[] = [];
    for (const role of roles) {
      try {
        out.push({ role, permissions: await this.repo.getRolePermissions(ctx, role.id) });
      } catch (err) {
        throw mapRepoError(err, 'get role permissions');
      }
    }
    return out;
  }

  async listPermissions(ctx: Ctx): Promise<Permission[]> {
    try {
      return await this.repo.listPermissions(ctx);
    } catch (err) {
      throw mapRepoError(err, 'list permissions');
    }
  }

  async createRole(ctx: Ctx, req: CreateRoleRequest): Promise<Role> {
    const key = slugifyKey(req.key, req.name);
    if (key === '') throw badRequest('role key is required');
    if (req.name.trim() === '') throw badRequest('role name is required');

    let role: Role;
    try {
      role = await this.repo.createRole(ctx, {
        key,
        name: req.name,
        description: req.description,
      });
    } catch (err) {
      throw mapRepoError(err, 'create role');
    }

    if (req.permissions !== undefined) {
      try {
        await this.repo.setRolePermissions(ctx, role.id, req.permissions);
      } catch (err) {
        throw mapRepoError(err, 'set role permissions');
      }
    }
    this.invalidate(role.id);
    return role;
  }

  async updateRole(ctx: Ctx, req: UpdateRoleRequest): Promise<Role> {
    if (req.name.trim() === '') throw badRequest('role name is required');

    let role: Role;
    try {
      role = await this.repo.updateRole(ctx, {
        id: req.id,
        name: req.name,
        description: req.description,
      });
    } catch (err) {
      throw mapRepoError(err, 'update role');
    }

    // permissions undefined бол эрхийг ХӨНДӨХГҮЙ (хоосон массив нь "бүгдийг
    // хас" гэсэн ТОДОРХОЙ хүсэл — тэр хоёрыг ялгах нь чухал).
    if (req.permissions !== undefined) {
      try {
        await this.repo.setRolePermissions(ctx, req.id, req.permissions);
      } catch (err) {
        throw mapRepoError(err, 'set role permissions');
      }
    }
    this.invalidate(req.id);
    return role;
  }

  /** deleteRole нь ашиглагдаж буй эрхийг устгуулахгүй (хэрэглэгч эрхгүй болно). */
  async deleteRole(ctx: Ctx, id: number): Promise<void> {
    let count: number;
    try {
      count = await this.repo.countUsersWithRole(ctx, id);
    } catch (err) {
      throw mapRepoError(err, 'count users with role');
    }
    if (count > 0) throw conflict('role is assigned to users');

    try {
      await this.repo.deleteRole(ctx, id);
    } catch (err) {
      throw mapRepoError(err, 'delete role');
    }
    this.invalidate(id);
  }

  async setRolePermissions(ctx: Ctx, roleId: number, keys: string[]): Promise<void> {
    // Эрх байгаа эсэхийг эхлээд шалгана — эс бөгөөс байхгүй role-д эрх онооход
    // чимээгүй амжилттай болно.
    try {
      await this.repo.getRole(ctx, roleId);
    } catch (err) {
      throw mapRepoError(err, 'get role');
    }
    try {
      await this.repo.setRolePermissions(ctx, roleId, keys);
    } catch (err) {
      throw mapRepoError(err, 'set role permissions');
    }
    this.invalidate(roleId);
  }

  /**
   * resolve нь нэг role-ийн эрхийн түлхүүрүүдийг буцаана (кэштэй). admin болон
   * superadmin нь каталогийн БҮХ эрхэд auto-resolve хийгдэнэ — шинэ эрх нэмэгдсэн
   * ч тэд автоматаар авна.
   *
   * Хүсэлтийн үед isAdmin bypass аль хэдийн хамардаг ч энэ нь resolve-ийг ШУУД
   * дуудагчдад (жишээ нь /rbac/me) ч зөв хэвээр байлгана.
   */
  async resolve(ctx: Ctx, roleId: number): Promise<string[]> {
    const cached = this.cache.get(roleId);
    if (cached && this.now() < cached.expMs) return cached.keys;

    let role: Role;
    try {
      role = await this.repo.getRole(ctx, roleId);
    } catch (err) {
      throw mapRepoError(err, 'get role');
    }

    let keys: string[];
    if (role.key === adminRoleKey || role.key === superAdminRoleKey) {
      try {
        keys = (await this.repo.listPermissions(ctx)).map((p) => p.key);
      } catch (err) {
        throw mapRepoError(err, 'list permissions');
      }
    } else {
      try {
        keys = await this.repo.getRolePermissions(ctx, roleId);
      } catch (err) {
        throw mapRepoError(err, 'get role permissions');
      }
    }
    keys.sort();

    this.cache.set(roleId, { keys, expMs: this.now() + cacheTTLMs });
    return keys;
  }
}

export function newRBACUsecase(repo: RBACRepository, now?: () => number): RBACUsecase {
  return new RBACUsecaseImpl(repo, now);
}
