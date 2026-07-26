// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { User } from '../../../domain/users.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/** SSOUserInput нь SSO-оос ирсэн иргэний талбарууд (upsert-д). */
export interface SSOUserInput {
  username: string;
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  email: string;
  roleId: number;
  googleSub: string;
  googleEmail: string;
  googleName: string;
  googlePicture: string;
}

/**
 * SSOUserRepository нь SSO-оор нэвтэрсэн иргэнийг users хүснэгтэд upsert хийнэ.
 * eID upsert-ийн адил "service" RLS контекст дор ажиллана (нэвтрэхээс өмнөх
 * урсгал тул хэрэглэгчийн identity хараахан байхгүй).
 */
export interface SSOUserRepository {
  /** upsertBySSOSub — регистр/иргэний дугааргүй үед (pairwise sub-ээр). */
  upsertBySSOSub(ctx: Ctx, ssoSub: string, input: SSOUserInput): Promise<User>;
  /**
   * upsertByCivilID — nationalid scope-оос иргэний дугаар ирсэн үед байгаа eID
   * хэрэглэгчтэй civil_id-ээр тааруулж, sso_sub холбоно (ДАВХАРДЛААС сэргийлнэ).
   */
  upsertByCivilID(
    ctx: Ctx,
    civilId: string,
    nationalId: string,
    ssoSub: string,
    input: SSOUserInput,
  ): Promise<User>;
  /**
   * authorizedByCivilOrNational — private платформын шалгуур: civil_id ЭСВЭЛ
   * national_id-аар тохирох (админаас урьдчилан бүртгэсэн) хэрэглэгч байгаа эсэх.
   */
  authorizedByCivilOrNational(ctx: Ctx, civilId: string, nationalId: string): Promise<boolean>;
}

/**
 * PlatformSettingsRepository нь платформын хандалтын горимыг уншиж/бичнэ
 * (platform_settings хүснэгт, нэг мөр).
 */
export interface PlatformSettingsRepository {
  getAccessMode(ctx: Ctx): Promise<string>;
  setAccessMode(ctx: Ctx, mode: string): Promise<void>;
}
