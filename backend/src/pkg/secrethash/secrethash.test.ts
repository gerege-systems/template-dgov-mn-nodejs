// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// secrethash-ийн unit тестүүд.
//
// ХАМГИЙН ЧУХАЛ нь ЭТАЛОН ВЕКТОРУУД: доорх hash-ууд нь Go хувилбар болон Ory
// Hydra-гаас БОДИТООР гаргасан утгууд юм. Эдгээр таарахгүй бол шилжилтийн үед
// одоо байгаа client-ууд secret-ээрээ нэвтэрч чадахгүй болно — тиймээс энэ нь
// зүгээр нэг regression биш, ХЭРЭГЛЭГЧ-НӨЛӨӨЛӨХ гэрээ.

import { describe, expect, it } from 'vitest';

import { ErrUnknownFormat, hash, needsRehash, verify } from './secrethash.js';

/** Ory Hydra-гийн PBKDF2 форматын бодит векторууд (Go тесттэй ижил). */
const hydraVectors: [string, string][] = [
  [
    'correct-horse-battery-staple',
    '$pbkdf2-sha256$i=25000,l=32$Xk3NjhYzw2vo0iHb0dENsw$85qvQUf5V71AmArvdGdczye399QcGfByVrEhTAIX4XU',
  ],
  [
    'secret-1',
    '$pbkdf2-sha256$i=25000,l=32$9+PhFISYk7T5oPha6LOx0A$BFZRvBe6tSexuJRIgSEbdb9rfeob/PMnnh6BFRyGJMo',
  ],
  [
    'secret-2',
    '$pbkdf2-sha256$i=25000,l=32$Kn44x/395m0EQLy/l3ZhiQ$zwKukF725B990uDY4iZ1GTNCmsCHPJ9iAVFy3FImRrw',
  ],
];

/** Go хувилбарын Argon2id-ээр гаргасан бодит векторууд. */
const goArgonVectors: [string, string][] = [
  [
    'correct-horse-battery-staple',
    '$argon2id$v=19$m=65536,t=3,p=4$2n8p6wPQK0AmPMpYSLb1PA$bpQw4c2EsWl/lclkOAVTiR0TwU+faXXUNR7u70WC1DI',
  ],
  [
    'secret-1',
    '$argon2id$v=19$m=65536,t=3,p=4$uLzlzOz3cyUMJsycZ+Calw$zK8Hj5fKWFgdiHiKqzBdurp/bs1hdaH0NQuzIShT5nw',
  ],
];

describe('Hydra-гийн PBKDF2 (шилжилтийн нийцэл)', () => {
  it.each(hydraVectors)('«%s» векторыг зөв шалгана', async (secret, encoded) => {
    await expect(verify(encoded, secret)).resolves.toBe(true);
  });

  it('буруу secret-ийг татгалзана', async () => {
    const [, encoded] = hydraVectors[0]!;
    await expect(verify(encoded, 'wrong-password')).resolves.toBe(false);
  });

  it('PBKDF2 hash нь дахин хэшлэх шаардлагатай гэж тэмдэглэгдэнэ', () => {
    expect(needsRehash(hydraVectors[0]![1])).toBe(true);
  });
});

describe('Go-ийн Argon2id (байт-нийцэл)', () => {
  it.each(goArgonVectors)('Go-гийн «%s» hash-ыг зөв шалгана', async (secret, encoded) => {
    await expect(verify(encoded, secret)).resolves.toBe(true);
  });

  it('буруу secret-ийг татгалзана', async () => {
    const [, encoded] = goArgonVectors[0]!;
    await expect(verify(encoded, 'nope')).resolves.toBe(false);
  });
});

describe('шинэ hash үүсгэх', () => {
  it('PHC мөр нь Go-той ИЖИЛ параметртэй гарна', async () => {
    const encoded = await hash('secret-value-1234');
    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$[^$]+\$[^$]+$/);
    // salt + hash сегментүүд нь padding-ГҮЙ base64 (Go-ийн RawStdEncoding).
    // ('=' нь параметрийн хэсэгт (v=19, m=65536) байдаг тул зөвхөн сүүлийн
    // хоёр сегментийг шалгана.)
    const [, , , , salt, digest] = encoded.split('$');
    expect(salt).not.toContain('=');
    expect(digest).not.toContain('=');
  });

  it('өөрөө үүсгэсэн hash-аа шалгаж чадна (round-trip)', async () => {
    const encoded = await hash('another-secret-4567');
    await expect(verify(encoded, 'another-secret-4567')).resolves.toBe(true);
    await expect(verify(encoded, 'another-secret-4568')).resolves.toBe(false);
  });

  it('ижил secret тус бүрд ӨӨР salt (тиймээс өөр hash) үүснэ', async () => {
    const [a, b] = await Promise.all([hash('same-secret-9999'), hash('same-secret-9999')]);
    expect(a).not.toBe(b);
  });

  it('шинэ hash нь дахин хэшлэх шаардлагагүй', async () => {
    expect(needsRehash(await hash('x'.repeat(20)))).toBe(false);
  });
});

describe('гэмтсэн/хорлонтой оролт (fail-closed)', () => {
  const bad = [
    '',
    'plaintext',
    '$md5$deadbeef',
    '$pbkdf2-sha256$only-three-parts',
    // Итераци тэг — тооцоолол алгасах оролдлого.
    '$pbkdf2-sha256$i=0,l=32$Xk3NjhYzw2vo0iHb0dENsw$85qvQUf5V71AmArvdGdczye399QcGfByVrEhTAIX4XU',
    // Итераци дутуу.
    '$pbkdf2-sha256$l=32$Xk3NjhYzw2vo0iHb0dENsw$85qvQUf5V71AmArvdGdczye399QcGfByVrEhTAIX4XU',
    // Мэдэгдсэн урт нь бодит hash-тай зөрсөн.
    '$pbkdf2-sha256$i=25000,l=64$Xk3NjhYzw2vo0iHb0dENsw$85qvQUf5V71AmArvdGdczye399QcGfByVrEhTAIX4XU',
    // Argon2-ийн буруу хувилбар.
    '$argon2id$v=16$m=65536,t=3,p=4$2n8p6wPQK0AmPMpYSLb1PA$bpQw4c2EsWl/lclkOAVTiR0TwU+faXXUNR7u70WC1DI',
    // Argon2-ийн параметр дутуу.
    '$argon2id$v=19$m=65536,t=3$2n8p6wPQK0AmPMpYSLb1PA$bpQw4c2EsWl/lclkOAVTiR0TwU+faXXUNR7u70WC1DI',
  ];

  it.each(bad)('«%s» нь ErrUnknownFormat шиднэ (чимээгүй true БИШ)', async (encoded) => {
    await expect(verify(encoded, 'anything')).rejects.toBeInstanceOf(ErrUnknownFormat);
  });

  it('хэт олон давталт (CPU шавхах) татгалзана', async () => {
    await expect(
      verify(
        '$pbkdf2-sha256$i=999999999,l=32$Xk3NjhYzw2vo0iHb0dENsw$85qvQUf5V71AmArvdGdczye399QcGfByVrEhTAIX4XU',
        'x',
      ),
    ).rejects.toBeInstanceOf(ErrUnknownFormat);
  });
});
