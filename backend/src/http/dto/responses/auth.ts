// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Auth урсгалуудын хариуны DTO. JSON түлхүүрүүд Go хувилбартай ЯГ ижил.
//
// АЮУЛГҮЙ БАЙДЛЫН ГОЛ ДҮРЭМ: eidPollResponse нь COMPLETE БИШ төлөвт токен ч,
// хэрэглэгчийн мэдээлэл ч бөглөх ЁСГҮЙ. RUNNING хариунд токен алдагдвал
// хэн ч (session ID-г мэдсэн л бол) session-ийг булаах боломжтой болно.

import type {
  EIDPollResponse as UcEIDPollResponse,
  EIDStartResponse as UcEIDStartResponse,
  GoogleLoginResponse as UcGoogleLoginResponse,
  LoginResult,
} from '../../../usecases/auth/auth_usecase.js';
import { userResponseFromDomain, type UserResponse } from './user.js';

/**
 * EIDStartResponse нь POST /auth/eid/start(-id)-ийн хариу — клиент QR/deep-link
 * харуулж, /eid/poll руу session_id-г дамжуулна.
 */
export interface EIDStartResponse {
  session_id: string;
  device_link_url: string;
  verification_code: string;
  expires_at: string;
}

export function eidStartResponse(r: UcEIDStartResponse): EIDStartResponse {
  return {
    session_id: r.sessionId,
    device_link_url: r.deviceLinkUrl,
    verification_code: r.verificationCode,
    expires_at: r.expiresAt,
  };
}

/**
 * EIDPollResponse нь POST /auth/eid/poll-ийн хариу. state нь IdP-ийн session
 * төлөв; COMPLETE үед хэрэглэгчийн бүх талбар + токенууд /login-той ИЖИЛ
 * хэлбэрээр бөглөгдөнө (клиентийн уншилт өөрчлөгдөхгүй).
 */
export interface EIDPollResponse extends Partial<UserResponse> {
  state: string;
  mfa_required?: boolean;
  mfa_token?: string;
}

/**
 * eidPollResponse нь usecase-ийн үр дүнг DTO рүү буулгана. COMPLETE БИШ үед
 * зөвхөн state бөглөнө — хэрэглэгчийн талбар ч, токен ч ГАРАХГҮЙ.
 */
export function eidPollResponse(r: UcEIDPollResponse): EIDPollResponse {
  // MFA шаардлагатай — session олгогдоогүй тул зөвхөн mfa_token буцна.
  if (r.mfaRequired) {
    return { state: r.state, mfa_required: true, mfa_token: r.mfaToken };
  }
  if (r.state === 'COMPLETE' && r.user) {
    return {
      state: r.state,
      ...userResponseFromDomain(r.user),
      token: r.accessToken,
      refresh_token: r.refreshToken,
    };
  }
  return { state: r.state };
}

/**
 * loginResponse нь /refresh (болон Google-ийн шууд нэвтрэлт)-ийн хариу:
 * хэрэглэгчийн талбарууд + шинээр олгосон токен хос.
 */
export function loginResponse(r: LoginResult): UserResponse {
  return {
    ...userResponseFromDomain(r.user),
    token: r.accessToken,
    refresh_token: r.refreshToken,
  };
}

/**
 * GoogleLoginResponse нь POST /auth/google-ийн хариу. linked=true бол user
 * (токентой) дүүрэн; false бол link_token + email (eID-ээр баталгаажуулах).
 *
 * mfa_required=true (зөвхөн super admin) бол user БАЙХГҮЙ — клиент mfa_token +
 * TOTP/нөөц кодоор /auth/superadmin/mfa-г дуудаж session авна. Клиент
 * linked-ээс ӨМНӨ mfa_required-ийг шалгах ёстой.
 */
export interface GoogleLoginResponse {
  linked: boolean;
  user?: UserResponse;
  link_token?: string;
  email?: string;
  mfa_required?: boolean;
  mfa_token?: string;
}

export function googleLoginResponse(r: UcGoogleLoginResponse): GoogleLoginResponse {
  // MFA шаардлагатай — токен/хэрэглэгч буцаахгүй (session хараахан олгогдоогүй).
  if (r.mfaRequired) {
    return { linked: true, mfa_required: true, mfa_token: r.mfaToken, email: r.email };
  }
  if (r.linked && r.login) {
    return { linked: true, user: loginResponse(r.login) };
  }
  return { linked: false, link_token: r.linkToken, email: r.email };
}
