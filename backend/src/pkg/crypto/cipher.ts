// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/crypto нь storage-д мэдрэмтгий утга (OAuth токен, TOTP secret)-ыг
// AES-256-GCM-ээр шифрлэх энгийн туслах.
//
// Түлхүүрийг тохиргооны мөрөөс SHA-256-аар 32 байт болгон гаргадаг тул ДУРЫН
// урттай нууц утга ажиллана (production-д хүчтэй түлхүүр тохируулна).
//
// Wire формат: `base64(nonce ‖ ciphertext ‖ tag)` — Go-ийн `gcm.Seal(nonce, …)`
// гаралттай БАЙТ-НИЙЦТЭЙ. (Node нь authentication tag-ыг тусад нь өгдөг тул
// гараар залгах шаардлагатай; Go нь ciphertext-ийн ард автоматаар нэмдэг.)

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** AES-256-GCM-ийн nonce (IV) урт — Go-ийн `cipher.NewGCM` өгөгдмөлтэй ижил. */
const nonceLen = 12;
/** GCM authentication tag-ийн урт. */
const tagLen = 16;

/** Cipher нь AES-256-GCM шифрлэгч. */
export class Cipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash('sha256').update(secret, 'utf8').digest();
  }

  /** encrypt нь хоосон оролтыг ХООСНООР үлдээнэ (сонголттой талбарууд байдаг). */
  encrypt(plain: string): string {
    if (plain === '') return '';
    const nonce = randomBytes(nonceLen);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, sealed, cipher.getAuthTag()]).toString('base64');
  }

  /** decrypt нь encrypt-ийн урвуу. Гэмтсэн/өөр түлхүүртэй бол алдаа шиднэ. */
  decrypt(enc: string): string {
    if (enc === '') return '';
    const raw = Buffer.from(enc, 'base64');
    if (raw.length < nonceLen + tagLen) throw new Error('crypto: ciphertext too short');
    const nonce = raw.subarray(0, nonceLen);
    const tag = raw.subarray(raw.length - tagLen);
    const ciphertext = raw.subarray(nonceLen, raw.length - tagLen);
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}

export const newCipher = (secret: string): Cipher => new Cipher(secret);
