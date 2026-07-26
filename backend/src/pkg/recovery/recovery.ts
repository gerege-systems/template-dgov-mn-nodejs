// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/recovery нь 2FA-ийн нөөц (recovery) кодуудыг үүсгэх, нормчлох болон hash
// хийх туслах. Кодыг ЗӨВХӨН нэг удаа (үүсгэх үед) хэрэглэгчид харуулж,
// хадгалахдаа SHA-256 hash-ийг л хадгална — DB алдагдсан ч кодоор нэвтрэх
// боломжгүй. Хэрэглэгч код оруулахад дахин hash хийж тулгана.

import { createHash, randomBytes } from 'node:crypto';

/** defaultCount нь superadmin-д нэг удаа үүсгэж өгөх нөөц кодын тоо. */
export const defaultCount = 10;

/** groupSize нь кодын нэг бүлгийн урт — "XXXX-XXXX" хэлбэр уншихад хялбар. */
const groupSize = 4;

/** base32Alphabet нь RFC 4648 (padding-гүй) — стандарт цагаан толгой. */
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** base32Encode нь байтуудыг padding-гүй base32 болгоно. */
function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += base32Alphabet[(value << (5 - bits)) & 31];
  return out;
}

/**
 * generateRecoveryCodes нь n ширхэг crypto-random нөөц код үүсгэнэ (n ≤ 0 бол
 * defaultCount). Буцаах кодууд нь ЭНГИЙН ТЕКСТ — дуудагч тэдгээрийг хэрэглэгчид
 * НЭГ УДАА харуулж, хадгалахдаа hashRecoveryCode-ийг ашиглана.
 */
export function generateRecoveryCodes(n = defaultCount): string[] {
  const count = n <= 0 ? defaultCount : n;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // 5 байт = 40 бит = 8 base32 тэмдэгт.
    const s = base32Encode(randomBytes(5));
    out.push(`${s.slice(0, groupSize)}-${s.slice(groupSize)}`);
  }
  return out;
}

/**
 * normalizeRecoveryCode нь оруулсан кодыг каноник хэлбэрт буулгана: тусгаарлагч
 * хасаж, том үсэг болгоно. "abcd-efgh", "ABCD EFGH", "ABCDEFGH" бүгд ижил
 * hash руу буудаг.
 */
export const normalizeRecoveryCode = (code: string): string =>
  code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/**
 * hashRecoveryCode нь кодыг нормчлоод SHA-256 (hex) болгоно — DB-д ЗӨВХӨН энэ
 * утга хадгалагдана. Код нь өндөр энтропитой, санамсаргүй тул нууц үгийн адил
 * удаан KDF (bcrypt) шаардлагагүй.
 */
export const hashRecoveryCode = (code: string): string =>
  createHash('sha256').update(normalizeRecoveryCode(code), 'utf8').digest('hex');

/** hashAllRecoveryCodes нь кодын жагсаалтыг hash-ийн жагсаалт болгоно. */
export const hashAllRecoveryCodes = (codes: string[]): string[] => codes.map(hashRecoveryCode);
