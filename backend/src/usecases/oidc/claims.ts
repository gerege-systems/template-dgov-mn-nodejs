// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { User } from '../../domain/users.js';
import { fullName } from '../../domain/users.js';

/**
 * claimsForScopes нь олгосон scope-оос хамааран иргэний claims-ыг гаргана.
 *
 * ЭНЭ БОЛ ГАДААД ГЭРЭЭ: RP-үүд эдгээр нэрсээр (name, national_id, …) хэрэглэгчээ
 * таньдаг тул нэр өөрчлөх нь эвдрэл үүсгэнэ.
 *
 * `sub`-ыг ЭНД тавихгүй — token endpoint нь challenge-ийн subject-ээс тавина.
 *
 * Claims нь token гаргах МӨЧИД угсрагдана (consent өгсөн мөчид биш) — иргэн
 * профайлаа шинэчилбэл дараагийн token шинэ утгыг агуулна.
 */
export function claimsForScopes(scopes: string[], u: User): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  const set = (k: string, v: string): void => {
    if (v.trim() !== '') claims[k] = v;
  };

  for (const s of scopes) {
    switch (s) {
      case 'profile':
        set('name', fullName(u));
        set('given_name', u.firstName);
        set('family_name', u.lastName);
        set('given_name_en', u.firstNameEn);
        set('family_name_en', u.lastNameEn);
        break;
      case 'email':
        set('email', u.email);
        if (u.email !== '') claims.email_verified = true;
        break;
      case 'nationalid':
        set('national_id', u.nationalId);
        set('register_number', u.civilId);
        break;
      case 'google':
        // Google холболт — ЗӨВХӨН RP "google" scope-ыг хүсэж, иргэн зөвшөөрсөн
        // үед дамжуулна. Scope-гүйгээр болзолгүй дамжуулбал openid-only RP хүртэл
        // иргэний Google и-мэйл/нэр/зургийг зөвшөөрөлгүйгээр авах
        // data-minimization зөрчил үүснэ.
        if (u.googleSub.trim() !== '') {
          claims.google_sub = u.googleSub;
          set('google_email', u.googleEmail);
          set('google_name', u.googleName);
          set('google_picture', u.googlePicture);
        }
        break;
      default:
        break;
    }
  }
  return claims;
}
