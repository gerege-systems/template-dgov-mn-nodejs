// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * ErrSSOTokenNotFound нь тухайн хэрэглэгчийн хадгалагдсан SSO токен байхгүй
 * (нэвтрэлт offline_access-ээс өмнө болсон, эсвэл устсан) үед буцна.
 *
 * Домэйн давхаргад байрлана: repository (шидэгч) болон auth usecase (баригч)
 * ХОЁУЛАА үүнийг харах ёстой — өөр өөр газар давхардуулж тодорхойлбол
 * `instanceof` шалгалт чимээгүй бүтэлгүйтэж, "дахин нэвтэрнэ үү" гэсэн 401
 * 500 болж хувирна.
 */
export class ErrSSOTokenNotFound extends Error {
  constructor() {
    super('sso token not found');
    this.name = 'ErrSSOTokenNotFound';
  }
}

/**
 * SSOToken нь иргэний SSO OAuth токенууд НЭЭЛТТЭЙ хэлбэрээр. Repository нь
 * эдгээрийг DB-д AES-GCM-ээр шифрлэж хадгална; энэ бүтэц зөвхөн санах ойд.
 */
export interface SSOToken {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
}
