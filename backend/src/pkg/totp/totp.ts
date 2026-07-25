// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/totp нь TOTP (RFC 6238) 2FA-ийн нимгэн боодол — secret үүсгэх,
// authenticator app-д уншуулах otpauth:// URI гаргах, код баталгаажуулах.
// otplib дээр суурилна; QR-г frontend (otpauth URI)-аас зурна.

import { authenticator } from 'otplib';

/**
 * generateTotp нь шинэ TOTP secret (base32) + otpauth:// provisioning URI
 * буцаана. issuer нь app-ийн нэр, account нь хэрэглэгчийн таних (и-мэйл) —
 * authenticator app-д эдгээр харагдана.
 */
export function generateTotp(issuer: string, account: string): { secret: string; url: string } {
  const secret = authenticator.generateSecret();
  return { secret, url: authenticator.keyuri(account, issuer, secret) };
}

/**
 * validateTotp нь 6 оронтой кодыг secret-тэй тулгана (±1 цонх — Go хувилбарын
 * pquerna/otp-ийн өгөгдмөлтэй ижил, цагийн бага зөрүүг тэсвэрлэнэ).
 */
export function validateTotp(code: string, secret: string): boolean {
  if (code.trim() === '' || secret === '') return false;
  // window: [өмнөх, дараах] — 1 алхам (30с) хоёр тийш.
  authenticator.options = { window: 1 };
  try {
    return authenticator.check(code.trim(), secret);
  } catch {
    return false;
  }
}
