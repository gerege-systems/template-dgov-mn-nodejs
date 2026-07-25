// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/secrethash нь OAuth2 client secret-ийг хадгалах/шалгах hash-ийг удирдана.
//
// ХОЁР ФОРМАТ дэмжинэ:
//
//   • `$pbkdf2-sha256$i=25000,l=32$<salt>$<hash>` — Ory Hydra-гийн формат.
//     Hydra-аас шилжүүлсэн client-ууд secret-ээ СОЛИЛГҮЙ ажиллаж байхын тулд
//     ЗӨВХӨН шалгах (verify) зорилгоор дэмжинэ.
//   • `$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>` — ШИНЭ secret-ийг үүгээр
//     хэшлэнэ. Админ гараар богино secret оноож болдог (16 тэмдэгтийн доод
//     хязгаар) тул PBKDF2-25000-аас хамаагүй тэсвэртэй KDF хэрэгтэй.
//
// base64 нь ХОЁУЛАНД стандарт alphabet (+/), padding-ГҮЙ — Go хувилбартай
// байт-нийцтэй байхын тулд (нэг DB хуваалцаж болно).
//
// Argon2-г `hash-wasm` (цэвэр WebAssembly)-ээр гүйцэтгэв: native build
// шаардахгүй тул distroless image-д node-gyp хэрэггүй, CI тогтвортой.

import { pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { argon2id } from 'hash-wasm';

const pbkdf2Async = promisify(pbkdf2Cb);

/** Argon2id-ийн параметрүүд — OWASP-ийн зөвлөмжийн дагуу (64 MiB, 3 дамжлага). */
const argonMemoryKiB = 64 * 1024;
const argonTime = 3;
const argonThreads = 4;
const argonKeyLen = 32;
const saltLen = 16;
/** Argon2-ийн хувилбар (0x13 = 19) — PHC мөрд бичигдэнэ. */
const argonVersion = 19;

/** Хадгалагдсан hash-аас уншсан түлхүүрийн зөвшөөрөгдөх урт. */
const minKeyLen = 16;
const maxKeyLen = 64;
/** PBKDF2-ийн давталтын ДЭЭД хязгаар (Ory нь 25000 ашигладаг). */
const maxIterations = 1_000_000;

/**
 * ErrUnknownFormat нь hash мөрийг таних боломжгүй үед буцна. Дуудагч үүнийг
 * "secret тохирохгүй"-тэй ИЖИЛХЭН (fail-closed) хандах ёстой.
 */
export class ErrUnknownFormat extends Error {
  constructor() {
    super('secrethash: unknown hash format');
    this.name = 'ErrUnknownFormat';
  }
}

/** b64 нь padding-гүй стандарт base64 (Go-ийн RawStdEncoding-той ижил). */
const b64 = (buf: Buffer): string => buf.toString('base64').replace(/=+$/, '');

/** unb64 нь padding-гүй base64-г задална. */
function unb64(s: string): Buffer {
  const buf = Buffer.from(s, 'base64');
  // Хоосон/гэмтсэн оролтыг ялгана — Buffer.from нь чимээгүй хоосон буцаадаг.
  if (buf.length === 0 && s !== '') throw new ErrUnknownFormat();
  return buf;
}

/** hash нь шинэ secret-ийг Argon2id-ээр хэшилнэ (PHC мөр буцаана). */
export async function hash(secret: string): Promise<string> {
  const salt = randomBytes(saltLen);
  const digest = await argon2id({
    password: secret,
    salt,
    parallelism: argonThreads,
    iterations: argonTime,
    memorySize: argonMemoryKiB,
    hashLength: argonKeyLen,
    outputType: 'binary',
  });
  return (
    `$argon2id$v=${String(argonVersion)}` +
    `$m=${String(argonMemoryKiB)},t=${String(argonTime)},p=${String(argonThreads)}` +
    `$${b64(salt)}$${b64(Buffer.from(digest))}`
  );
}

/**
 * verify нь secret нь хадгалсан hash-тай тохирч байгаа эсэхийг шалгана.
 * Харьцуулалт ТОГТМОЛ хугацаанд (timingSafeEqual) хийгдэнэ.
 */
export async function verify(encoded: string, secret: string): Promise<boolean> {
  if (encoded.startsWith('$argon2id$')) return await verifyArgon2id(encoded, secret);
  if (encoded.startsWith('$pbkdf2-sha256$')) return await verifyPBKDF2(encoded, secret);
  throw new ErrUnknownFormat();
}

/**
 * needsRehash нь hash нь ХУУЧИН (Hydra-гийн PBKDF2) форматтай эсэхийг хэлнэ —
 * дуудагч амжилттай нэвтрэлтийн дараа Argon2id руу чимээгүй шинэчилж болно.
 */
export const needsRehash = (encoded: string): boolean => !encoded.startsWith('$argon2id$');

/** constantTimeEqual нь урт нь зөрсөн ч аюулгүй харьцуулна. */
function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** parsePBKDF2Params нь "i=25000,l=32"-ыг задална. */
function parsePBKDF2Params(s: string): { iterations: number; keyLen: number } {
  let iterations = 0;
  let keyLen = 0;
  for (const kv of s.split(',')) {
    const idx = kv.indexOf('=');
    if (idx < 0) throw new ErrUnknownFormat();
    const key = kv.slice(0, idx);
    const n = Number.parseInt(kv.slice(idx + 1), 10);
    if (!Number.isFinite(n) || n <= 0) throw new ErrUnknownFormat();
    if (key === 'i') iterations = n;
    else if (key === 'l') keyLen = n;
  }
  // Давталтын тоог ДЭЭРЭЭС хязгаарлана — hash мөр нь итерацийг тодорхойлдог тул
  // гэмтсэн/хорлонтой утга (i=10^9) CPU-г шавхах боломжтой.
  if (iterations === 0 || keyLen === 0 || iterations > maxIterations) {
    throw new ErrUnknownFormat();
  }
  return { iterations, keyLen };
}

/** verifyPBKDF2 нь Ory-гийн форматыг шалгана (зөвхөн шалгах — шинээр үүсгэхгүй). */
async function verifyPBKDF2(encoded: string, secret: string): Promise<boolean> {
  // ["", "pbkdf2-sha256", "i=25000,l=32", salt, hash]
  const parts = encoded.split('$');
  if (parts.length !== 5) throw new ErrUnknownFormat();
  const { iterations, keyLen } = parsePBKDF2Params(parts[2] ?? '');
  const salt = unb64(parts[3] ?? '');
  const want = unb64(parts[4] ?? '');
  if (keyLen !== want.length || keyLen < minKeyLen || keyLen > maxKeyLen) {
    throw new ErrUnknownFormat();
  }
  const got = await pbkdf2Async(secret, salt, iterations, keyLen, 'sha256');
  return constantTimeEqual(got, want);
}

/** verifyArgon2id нь `$argon2id$v=19$m=..,t=..,p=..$<salt>$<hash>`-ыг шалгана. */
async function verifyArgon2id(encoded: string, secret: string): Promise<boolean> {
  // ["", "argon2id", "v=19", "m=..,t=..,p=..", salt, hash]
  const parts = encoded.split('$');
  if (parts.length !== 6) throw new ErrUnknownFormat();

  const version = /^v=(\d+)$/.exec(parts[2] ?? '');
  if (!version || Number.parseInt(version[1] ?? '', 10) !== argonVersion) {
    throw new ErrUnknownFormat();
  }

  const params = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(parts[3] ?? '');
  if (!params) throw new ErrUnknownFormat();
  const memorySize = Number.parseInt(params[1] ?? '', 10);
  const iterations = Number.parseInt(params[2] ?? '', 10);
  const parallelism = Number.parseInt(params[3] ?? '', 10);
  if (memorySize <= 0 || iterations <= 0 || parallelism <= 0) throw new ErrUnknownFormat();

  const salt = unb64(parts[4] ?? '');
  const want = unb64(parts[5] ?? '');
  if (want.length < minKeyLen || want.length > maxKeyLen) throw new ErrUnknownFormat();

  const got = await argon2id({
    password: secret,
    salt,
    parallelism,
    iterations,
    memorySize,
    hashLength: want.length,
    outputType: 'binary',
  });
  return constantTimeEqual(Buffer.from(got), want);
}
