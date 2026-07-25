// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/assets нь хэрэглэгчийн гарын үсэг (хувь хүн) ба байгууллагын тамганы
// дардасын (байгууллага) зургийн URL-ийг удирдана. Зураг нь Google Drive-д
// (клиент талд хэрэглэгчийн холбосон токеноор) байршиж, энд зөвхөн URL
// хадгалагдана — өөрөөр хэлбэл энэ домэйн ФАЙЛ хадгалдаггүй.
//
// ЭРХИЙН ЗАГВАР: байгууллагын тамга бол баримтад тавигдах албан ёсны тэмдэг тул
//   • унших  — тухайн байгууллагын АЛЬ НЭГ эрхийн төлөөлөгч байхад хангалттай
//   • бичих  — зөвхөн ADMIN эрхтэй төлөөлөгч
// Аль ч тохиолдолд эрхийн эх сурвалж нь УЛСЫН БҮРТГЭЛ (eID-ээр асууна) — энэ
// template өөрөө "төлөөлөгч эсэх"-ийг хэзээ ч шийддэггүй.

import { badRequest, forbidden, internalCause } from '../../apperror/index.js';
import type { OrgStampRepository } from '../../datasources/repositories/interface/orgstamp.js';
import type { UserRepository } from '../../datasources/repositories/interface/users.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { ErrNotRepresentative } from '../../pkg/eid/eid_org.js';
import type { EidClient } from '../../pkg/eid/eid.js';
import type { UsersUsecase } from '../users/users_usecase.js';

export interface AssetsUsecase {
  /** getSignature нь нэвтэрсэн хэрэглэгчийн гарын үсгийн зургийн URL (эсвэл ""). */
  getSignature(ctx: Ctx, userId: string): Promise<string>;
  /** setSignature нь гарын үсгийн зургийн URL-ийг тавина/шинэчилнэ. */
  setSignature(ctx: Ctx, userId: string, url: string): Promise<void>;
  /** deleteSignature нь гарын үсгийг устгана. */
  deleteSignature(ctx: Ctx, userId: string): Promise<void>;
  /** getStamp нь байгууллагын тамганы зургийн URL (эсвэл "") — төлөөлөгчид. */
  getStamp(ctx: Ctx, userId: string, orgRegister: string): Promise<string>;
  /** setStamp нь байгууллагын тамгыг тавина — зөвхөн ADMIN. */
  setStamp(ctx: Ctx, userId: string, orgRegister: string, url: string): Promise<void>;
  /** deleteStamp нь байгууллагын тамгыг устгана — зөвхөн ADMIN. */
  deleteStamp(ctx: Ctx, userId: string, orgRegister: string): Promise<void>;
  /** setLatinName нь хэрэглэгчийн латин нэрийг гараар засна. */
  setLatinName(ctx: Ctx, userId: string, firstEn: string, lastEn: string): Promise<void>;
  /** setOrgNameLatin нь байгууллагын латин нэрийг засна (eID талд ADMIN шалгана). */
  setOrgNameLatin(ctx: Ctx, userId: string, orgRegister: string, nameLatin: string): Promise<void>;
}

class AssetsUsecaseImpl implements AssetsUsecase {
  constructor(
    private readonly users: UsersUsecase,
    private readonly userRepo: UserRepository,
    private readonly stamps: OrgStampRepository,
    private readonly eid: EidClient,
  ) {}

  // ── Гарын үсэг (хувь хүн) ──

  getSignature(ctx: Ctx, userId: string): Promise<string> {
    return this.userRepo.getSignature(ctx, userId);
  }

  async setSignature(ctx: Ctx, userId: string, url: string): Promise<void> {
    const trimmed = url.trim();
    if (trimmed === '') throw badRequest('Зургийн URL шаардлагатай');
    await this.userRepo.setSignature(ctx, userId, trimmed);
  }

  async deleteSignature(ctx: Ctx, userId: string): Promise<void> {
    // Хоосон мөр нь баганыг NULL болгоно (users repository-ийн гэрээ).
    await this.userRepo.setSignature(ctx, userId, '');
  }

  // ── Байгууллагын тамга ──

  async getStamp(ctx: Ctx, userId: string, orgRegister: string): Promise<string> {
    // Унших нь дурын төлөөлөгчид хангалттай; бичих нь ADMIN шаардана. Энэ
    // шалгалтгүй бол дурын нэвтэрсэн хэрэглэгч регистрийн дугаар таамаглаад
    // өөр байгууллагын тамгыг татаж авах боломжтой болно (IDOR).
    await this.requireOrgRepresentative(ctx, userId, orgRegister);
    return await this.stamps.get(ctx, orgRegister.trim());
  }

  async setStamp(ctx: Ctx, userId: string, orgRegister: string, url: string): Promise<void> {
    const trimmed = url.trim();
    if (trimmed === '') throw badRequest('Зургийн URL шаардлагатай');
    await this.requireOrgAdmin(ctx, userId, orgRegister);
    await this.stamps.upsert(ctx, orgRegister.trim(), trimmed, userId);
  }

  async deleteStamp(ctx: Ctx, userId: string, orgRegister: string): Promise<void> {
    await this.requireOrgAdmin(ctx, userId, orgRegister);
    await this.stamps.deleteStamp(ctx, orgRegister.trim());
  }

  // ── Латин нэр засах (галиглалт заримдаа буруу тул гараар) ──

  async setLatinName(ctx: Ctx, userId: string, firstEn: string, lastEn: string): Promise<void> {
    await this.userRepo.setLatinName(ctx, userId, firstEn, lastEn);
  }

  async setOrgNameLatin(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
    nameLatin: string,
  ): Promise<void> {
    const etsi = await this.actingEtsi(ctx, userId);
    try {
      await this.eid.updateOrgNameLatin(orgRegister.trim(), etsi, nameLatin, ctx.signal);
    } catch (err) {
      if (err instanceof ErrNotRepresentative) {
        throw forbidden('Зөвхөн ADMIN эрхтэй хүн байгууллагын латин нэрийг засаж чадна');
      }
      throw internalCause(err);
    }
  }

  /** actingEtsi нь нэвтэрсэн хэрэглэгчийн civil_id-аас ETSI (PNOMN-<CIVIL>) угсарна. */
  private async actingEtsi(ctx: Ctx, userId: string): Promise<string> {
    const got = await this.users.getById(ctx, { id: userId });
    const civ = got.user.civilId.trim();
    // eID-ээр нэвтрээгүй (жишээ нь Google) хэрэглэгч байгууллага төлөөлж
    // чадахгүй — улсын бүртгэлийн эрх нь ЗӨВХӨН иргэний eID-д холбогддог.
    if (civ === '') throw forbidden('eID-ээр нэвтэрсэн байх шаардлагатай');
    return `PNOMN-${civ.toUpperCase()}`;
  }

  /**
   * requireOrgAdmin нь нэвтэрсэн хэрэглэгч тухайн байгууллагын ADMIN эрхтэй
   * төлөөлөгч мөн эсэхийг eID-ээр (eidmongolia OrgSigners) шалгана.
   */
  private async requireOrgAdmin(ctx: Ctx, userId: string, orgRegister: string): Promise<void> {
    for (const s of await this.signersOf(ctx, userId, orgRegister)) {
      if (s.self && s.rightType === 'ADMIN') return;
    }
    throw forbidden('Зөвхөн ADMIN эрхтэй хүн тамга тавьж чадна');
  }

  /**
   * requireOrgRepresentative нь хэрэглэгч тухайн байгууллагын АЛЬ НЭГ эрхийн
   * (ADMIN шаардлагагүй) төлөөлөгч мөн эсэхийг шалгана.
   */
  private async requireOrgRepresentative(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
  ): Promise<void> {
    for (const s of await this.signersOf(ctx, userId, orgRegister)) {
      if (s.self) return;
    }
    throw forbidden('Та энэ байгууллагыг төлөөлдөггүй байна');
  }

  /** signersOf нь eID-ээс тухайн байгууллагын зурагчдыг авна (403 → Forbidden). */
  private async signersOf(ctx: Ctx, userId: string, orgRegister: string) {
    const etsi = await this.actingEtsi(ctx, userId);
    try {
      return await this.eid.orgSigners(orgRegister.trim(), etsi, ctx.signal);
    } catch (err) {
      if (err instanceof ErrNotRepresentative) {
        throw forbidden('Та энэ байгууллагыг төлөөлдөггүй байна');
      }
      throw internalCause(err);
    }
  }
}

export function newAssetsUsecase(
  users: UsersUsecase,
  userRepo: UserRepository,
  stamps: OrgStampRepository,
  eid: EidClient,
): AssetsUsecase {
  return new AssetsUsecaseImpl(users, userRepo, stamps, eid);
}
