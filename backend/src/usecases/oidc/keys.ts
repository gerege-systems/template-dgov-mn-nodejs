// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// id_token-ийн гарын үсгийн түлхүүр болон JWKS.
//
// Түлхүүр нь RS256 (RSA-2048) — RP-ийн бүх сан дэмждэг хамгийн өргөн хүлээн
// зөвшөөрөгдсөн алгоритм; Hydra ч мөн адилыг ашиглаж байсан тул RP-үүдийн
// шалгах тал өөрчлөгдөхгүй.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

import { internalCause, isNotFound, notFound } from '../../apperror/index.js';
import type { OAuthKeyRepository } from '../../datasources/repositories/interface/oauth.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { newCipher, type Cipher } from '../../pkg/crypto/cipher.js';

const rsaKeyBits = 2048;
export const AlgRS256 = 'RS256';

/** JWKSet нь RFC 7517-ийн JWK Set. */
export interface JWKSet {
  keys: Record<string, unknown>[];
}

interface CachedKey {
  kid: string;
  priv: KeyObject;
}

/**
 * publicJwkOf нь RSA нийтийн түлхүүрийн JWK дүрслэлийг (kid-тэй нь) угсарна.
 * Node-ийн jwk export нь n/e-г base64url-ээр өгдөг — RFC 7517-тэй нийцнэ.
 */
function publicJwkOf(kid: string, pub: KeyObject): Record<string, unknown> {
  const jwk = pub.export({ format: 'jwk' }) as { n?: string; e?: string };
  return { kty: 'RSA', use: 'sig', alg: AlgRS256, kid, n: jwk.n ?? '', e: jwk.e ?? '' };
}

/**
 * thumbprint нь RFC 7638-ийн JWK thumbprint-ыг kid болгон ашиглана — түлхүүрээс
 * детерминистик гардаг тул давхардахгүй бөгөөд гадны талд утга учиргүй.
 *
 * Канон хэлбэр: зөвхөн шаардлагатай талбарууд, ЦАГААН ТОЛГОЙН дарааллаар,
 * зайгүй. base64url утгад escape хийх тэмдэгт байхгүй тул JSON.stringify нь
 * RFC-ийн шаарддаг яг тэр хэлбэрийг өгнө.
 */
export function thumbprint(pub: KeyObject): string {
  const jwk = pub.export({ format: 'jwk' }) as { n?: string; e?: string };
  const canonical = JSON.stringify({ e: jwk.e ?? '', kty: 'RSA', n: jwk.n ?? '' });
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

/** KeyManager нь идэвхтэй хувийн түлхүүрийг задалж кэшлэн, JWKS-ийг угсарна. */
export class KeyManager {
  private cached: CachedKey | null = null;

  constructor(
    private readonly store: OAuthKeyRepository,
    private readonly cipher: Cipher,
  ) {}

  /**
   * ensureKey нь идэвхтэй түлхүүр байгаа эсэхийг шалгаж, байхгүй бол үүсгэнэ.
   * Boot үед дуудагдана — эхний ажиллагаанд түлхүүр бэлэн болно.
   */
  async ensureKey(ctx: Ctx): Promise<void> {
    try {
      await this.store.active(ctx);
      return;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    await this.generate(ctx);
  }

  /**
   * rotate нь одоогийн түлхүүрийг тэтгэвэрт гаргаж шинийг үүсгэнэ. Хуучин нь
   * JWKS-д ҮЛДЭХ тул түүгээр зурсан id_token-ууд дуусах хүртлээ хүчинтэй.
   */
  async rotate(ctx: Ctx): Promise<string> {
    await this.store.retireActive(ctx);
    return this.generate(ctx);
  }

  /** generate нь шинэ RSA түлхүүр үүсгэж, шифрлэн хадгална. */
  private async generate(ctx: Ctx): Promise<string> {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: rsaKeyBits });
    const der = privateKey.export({ type: 'pkcs8', format: 'der' });
    const enc = this.cipher.encrypt(der.toString('base64'));
    const kid = thumbprint(publicKey);

    await this.store.insert(ctx, {
      kid,
      alg: AlgRS256,
      privateKeyEnc: enc,
      publicJwk: publicJwkOf(kid, publicKey),
      active: true,
    });

    this.cached = { kid, priv: privateKey };
    return kid;
  }

  /**
   * signer нь гарын үсэг зурах идэвхтэй түлхүүрийг (kid + private key) буцаана.
   * Задалсан түлхүүрийг санах ойд кэшилнэ — хүсэлт бүрд AES задлалт хийхгүй.
   */
  async signer(ctx: Ctx): Promise<{ kid: string; key: KeyObject }> {
    const rec = await this.store.active(ctx);
    const cached = this.cached;
    if (cached && cached.kid === rec.kid) return { kid: cached.kid, key: cached.priv };

    const priv = this.decrypt(rec.privateKeyEnc);
    this.cached = { kid: rec.kid, priv };
    return { kid: rec.kid, key: priv };
  }

  private decrypt(enc: string): KeyObject {
    let der: Buffer;
    try {
      der = Buffer.from(this.cipher.decrypt(enc), 'base64');
    } catch (err) {
      throw internalCause(new Error(`oidc: decrypt private key: ${String(err)}`));
    }
    try {
      return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    } catch (err) {
      throw internalCause(new Error(`oidc: parse private key: ${String(err)}`));
    }
  }

  /** jwks нь нийтлэх бүх нийтийн түлхүүрийг буцаана (идэвхтэй нь эхэнд). */
  async jwks(ctx: Ctx): Promise<JWKSet> {
    const keys = await this.store.all(ctx);
    return { keys: keys.map((k) => k.publicJwk) };
  }

  /**
   * publicKey нь kid-ээр нийтийн түлхүүрийг буцаана (тэтгэвэрт гарснаас нь ч).
   * id_token_hint зэрэг ӨӨРСДИЙН гаргасан token-ыг шалгахад ашиглана.
   */
  async publicKey(ctx: Ctx, kid: string): Promise<KeyObject> {
    const keys = await this.store.all(ctx);
    const match = keys.find((k) => k.kid === kid);
    if (!match) throw notFound('signing key not found');
    try {
      return createPublicKey({ key: match.publicJwk as never, format: 'jwk' });
    } catch (err) {
      throw internalCause(new Error(`oidc: parse stored jwk: ${String(err)}`));
    }
  }
}

/**
 * newKeyManager нь encKey (INTEGRATION_ENC_KEY)-ээр хувийн түлхүүрийг
 * шифрлэх/задлах KeyManager үүсгэнэ.
 */
export const newKeyManager = (store: OAuthKeyRepository, encKey: string): KeyManager =>
  new KeyManager(store, newCipher(encKey));
