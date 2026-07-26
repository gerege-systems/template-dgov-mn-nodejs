// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// PDF гарын үсгийн unit тестүүд. Гол баталгаанууд:
//   • session-ийн эзэмшил РД-ээр шалгагдана — өөр иргэний session нь 404;
//   • asset татах нь ЗӨВХӨН https, дотоод сүлжээ рүү ХЭЗЭЭ Ч холбогдохгүй (SSRF);
//   • eidmongolia 403 нь ойлгомжтой Forbidden (5xx болж нуугдахгүй);
//   • v3 stamp унавал серверийн Document-Signer-ээр буулгаж, PDF-д гарын үсэг орно.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import {
  isDisallowedFetchIp,
  newSignUsecase,
  regNoMatches,
  toEtsi,
  type SignCache,
} from './sign_usecase.js';

const ctx: Ctx = background();

/** memoryCache нь Redis-ийн оронд ажиллах энгийн хадгалалт. */
function memoryCache(): SignCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    set: (_c: Ctx, key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    get: (_c: Ctx, key: string) => Promise.resolve(store.get(key) ?? null),
  };
}

const cfg = {
  v3BaseUrl: 'https://eid.example.invalid',
  rpUuid: 'rp-uuid',
  rpName: 'dgov.mn',
  apiSecret: 'rp-secret',
  signerCertPem: '',
  signerKeyPem: '',
  isProduction: false,
};

/**
 * minimalPdf нь бодит нэг хуудастай PDF. `useObjectStreams: false` нь init-ийн
 * хэвийшүүлэлттэй ижил — PAdES шигтгэгч сонгодог xref хүснэгт шаарддаг.
 */
async function minimalPdf(): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ETSI танигч', () => {
  it('РД-д PNOMN- угтвар нэмнэ', () => {
    expect(toEtsi(' УБ12345678 ')).toBe('PNOMN-УБ12345678');
  });

  it('аль хэдийн угтвартайг хэвээр үлдээнэ', () => {
    expect(toEtsi('PNOMN-123')).toBe('PNOMN-123');
    expect(toEtsi('ntrmn-9999')).toBe('NTRMN-9999');
  });
});

describe('regNoMatches', () => {
  it('зөвхөн ОРОН ТООны цөмийг тулгана', () => {
    expect(regNoMatches('PNOMN-12345678', 'УБ12345678')).toBe(true);
    expect(regNoMatches('PNOMN-87654321', 'УБ12345678')).toBe(false);
  });

  it('орон тоогүй serial дээр БЛОКЛОХГҮЙ (eID уялт хүчинтэй хэвээр)', () => {
    expect(regNoMatches('SOME-CERT-ID', 'УБ12345678')).toBe(true);
    expect(regNoMatches('', 'УБ12345678')).toBe(true);
  });
});

describe('SSRF хамгаалалт', () => {
  it('дотоод/loopback/link-local хаягуудыг хориглоно', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isDisallowedFetchIp(ip), ip).toBe(true);
    }
  });

  it('нийтийн хаягуудыг зөвшөөрнө', () => {
    expect(isDisallowedFetchIp('142.250.74.14')).toBe(false);
    expect(isDisallowedFetchIp('2404:6800:4004::1')).toBe(false);
  });

  it('IP биш мөрийг хориглоно (fail-closed)', () => {
    expect(isDisallowedFetchIp('not-an-ip')).toBe(true);
  });
});

describe('init', () => {
  const v3Ok = (): Response =>
    new Response(JSON.stringify({ sessionID: 'v3-1', vc: { value: '1234' } }), { status: 200 });

  it('PDF хоосон эсвэл хэт том бол 400', async () => {
    const uc = newSignUsecase(memoryCache(), cfg);
    await expect(
      uc.init(ctx, {
        regNo: 'УБ1',
        fullName: 'Бат',
        filename: 'a.pdf',
        pdf: Buffer.alloc(0),
        onBehalfOfOrg: '',
        signatureUrl: '',
        stampUrl: '',
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('регистргүй бол 401', async () => {
    const uc = newSignUsecase(memoryCache(), cfg);
    await expect(
      uc.init(ctx, {
        regNo: '   ',
        fullName: '',
        filename: 'a.pdf',
        pdf: Buffer.from('%PDF-1.4'),
        onBehalfOfOrg: '',
        signatureUrl: '',
        stampUrl: '',
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Unauthorized));
  });

  it('digest илгээж session хадгална', async () => {
    fetchMock.mockResolvedValue(v3Ok());
    const cache = memoryCache();
    const uc = newSignUsecase(cache, cfg);
    const pdf = await minimalPdf();

    const out = await uc.init(ctx, {
      regNo: 'УБ12345678',
      fullName: 'Дорж Бат',
      filename: 'гэрээ.pdf',
      pdf,
      onBehalfOfOrg: '',
      signatureUrl: '',
      stampUrl: '',
    });

    expect(out.session_id).toHaveLength(32);
    expect(out.verification_code).toBe('1234');
    expect(out.filename).toBe('гэрээ.pdf');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v3/signature/notification/etsi/');
    expect(url).toContain(encodeURIComponent('PNOMN-УБ12345678'));
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.hashType).toBe('SHA256');
    expect(body.signatureProtocol).toBe('ACSP_V2');
    // Хувь хүний гарын үсэгт onBehalfOf ОРОХГҮЙ.
    expect(body.onBehalfOf).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer rp-secret');
    expect(cache.store.size).toBe(1);
  });

  it('байгууллагын нэрийн өмнөөс бол onBehalfOf илгээнэ', async () => {
    fetchMock.mockResolvedValue(v3Ok());
    const uc = newSignUsecase(memoryCache(), cfg);
    await uc.init(ctx, {
      regNo: 'УБ1',
      fullName: '',
      filename: 'a.pdf',
      pdf: await minimalPdf(),
      onBehalfOfOrg: ' ntrmn-1234567 ',
      signatureUrl: '',
      stampUrl: '',
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as {
      onBehalfOf?: string;
    };
    expect(body.onBehalfOf).toBe('NTRMN-1234567');
  });

  it('eidmongolia 403 нь Forbidden болж ил гарна (5xx биш)', async () => {
    fetchMock.mockResolvedValue(new Response('forbidden', { status: 403 }));
    const uc = newSignUsecase(memoryCache(), cfg);
    await expect(
      uc.init(ctx, {
        regNo: 'УБ1',
        fullName: '',
        filename: 'a.pdf',
        pdf: await minimalPdf(),
        onBehalfOfOrg: 'NTRMN-1',
        signatureUrl: '',
        stampUrl: '',
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Forbidden));
  });

  it('http:// зургийн URL-д ХҮРЭХГҮЙ (зөвхөн https)', async () => {
    fetchMock.mockResolvedValue(v3Ok());
    const uc = newSignUsecase(memoryCache(), cfg);
    await uc.init(ctx, {
      regNo: 'УБ1',
      fullName: '',
      filename: 'a.pdf',
      pdf: await minimalPdf(),
      onBehalfOfOrg: '',
      signatureUrl: 'http://insecure.example.mn/sig.png',
      stampUrl: '',
    });
    // Цорын ганц fetch нь /v3 руу — зураг татагдаагүй.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/v3/');
  });

  it('дотоод хаяг руу заасан зургийн URL-д ХҮРЭХГҮЙ (SSRF)', async () => {
    fetchMock.mockResolvedValue(v3Ok());
    const uc = newSignUsecase(memoryCache(), cfg);
    await uc.init(ctx, {
      regNo: 'УБ1',
      fullName: '',
      filename: 'a.pdf',
      pdf: await minimalPdf(),
      onBehalfOfOrg: '',
      // Литерал loopback IP — DNS шийдэлгүйгээр шууд хаагдана.
      signatureUrl: 'https://127.0.0.1/sig.png',
      stampUrl: 'https://[::1]/stamp.png',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('poll', () => {
  const seed = async (state = 'running') => {
    const cache = memoryCache();
    cache.store.set(
      'pdfsign:sess-1',
      JSON.stringify({
        reg_no: 'УБ12345678',
        full_name: 'Дорж Бат',
        filename: 'a.pdf',
        pdf_b64: (await minimalPdf()).toString('base64'),
        doc_hash_b64: 'x',
        v3_session_id: 'v3-1',
        state,
        signer_name: '',
        signer_serial: '',
        completed_at: '',
        on_behalf_of_org: '',
        on_behalf_of_org_name: '',
      }),
    );
    return cache;
  };

  it('өөр иргэний session нь 404 (IDOR хаалт)', async () => {
    const uc = newSignUsecase(await seed(), cfg);
    await expect(uc.poll(ctx, 'ӨӨР-РД', 'sess-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.NotFound),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('байхгүй session нь мөн 404', async () => {
    const uc = newSignUsecase(memoryCache(), cfg);
    await expect(uc.poll(ctx, 'УБ1', 'no-such')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.NotFound),
    );
  });

  it('COMPLETE + OK нь completed болгож нэрийг хадгална', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          state: 'COMPLETE',
          result: { endResult: 'OK' },
          onBehalfOf: { orgName: 'Гэрэгэ ХХК' },
        }),
        { status: 200 },
      ),
    );
    const cache = await seed();
    const uc = newSignUsecase(cache, cfg);
    expect(await uc.poll(ctx, 'УБ12345678', 'sess-1')).toBe('completed');
    const st = JSON.parse(cache.store.get('pdfsign:sess-1') ?? '{}') as Record<string, string>;
    expect(st.state).toBe('completed');
    // Байгууллагын нэр нь eidmongolia-аас БАТАЛГААЖСАН утга.
    expect(st.on_behalf_of_org_name).toBe('Гэрэгэ ХХК');
  });

  it('USER_REFUSED нь rejected', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'COMPLETE', result: { endResult: 'USER_REFUSED' } })),
    );
    const uc = newSignUsecase(await seed(), cfg);
    expect(await uc.poll(ctx, 'УБ12345678', 'sess-1')).toBe('rejected');
  });

  it('COMPLETE-ийн бусад endResult нь failed', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'COMPLETE', result: { endResult: 'TIMEOUT' } })),
    );
    const uc = newSignUsecase(await seed(), cfg);
    expect(await uc.poll(ctx, 'УБ12345678', 'sess-1')).toBe('failed');
  });

  it('түр зуурын алдаа нь running хэвээр (дахин poll)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const uc = newSignUsecase(await seed(), cfg);
    expect(await uc.poll(ctx, 'УБ12345678', 'sess-1')).toBe('running');
  });

  it('терминал төлөвт дахин /v3 руу хандахгүй', async () => {
    const uc = newSignUsecase(await seed('completed'), cfg);
    expect(await uc.poll(ctx, 'УБ12345678', 'sess-1')).toBe('completed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('download', () => {
  const seedCompleted = async () => {
    const cache = memoryCache();
    cache.store.set(
      'pdfsign:sess-1',
      JSON.stringify({
        reg_no: 'УБ12345678',
        full_name: 'Дорж Бат',
        filename: 'гэрээ.pdf',
        pdf_b64: (await minimalPdf()).toString('base64'),
        doc_hash_b64: 'x',
        v3_session_id: 'v3-1',
        state: 'completed',
        signer_name: 'ДОРЖ БАТ',
        signer_serial: 'PNOMN-12345678',
        completed_at: new Date().toISOString(),
        on_behalf_of_org: '',
        on_behalf_of_org_name: '',
      }),
    );
    return cache;
  };

  it('дуусаагүй session нь 400', async () => {
    const cache = memoryCache();
    cache.store.set(
      'pdfsign:sess-1',
      JSON.stringify({ reg_no: 'УБ1', state: 'running', pdf_b64: '', filename: 'a.pdf' }),
    );
    const uc = newSignUsecase(cache, cfg);
    await expect(uc.download(ctx, 'УБ1', 'sess-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('өөр иргэний session нь 404', async () => {
    const uc = newSignUsecase(await seedCompleted(), cfg);
    await expect(uc.download(ctx, 'ӨӨР', 'sess-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.NotFound),
    );
  });

  it('v3 stamp амжилттай бол түүний PDF-ийг буцаана', async () => {
    const stamped = Buffer.from('%PDF-stamped');
    fetchMock.mockResolvedValue(new Response(stamped, { status: 200 }));
    const uc = newSignUsecase(await seedCompleted(), cfg);
    const out = await uc.download(ctx, 'УБ12345678', 'sess-1');
    expect(out.pdf.toString()).toBe('%PDF-stamped');
    expect(out.filename).toBe('гэрээ-signed.pdf');
  });

  it('stamp унавал серверийн Document-Signer-ээр гарын үсэг ШИГТГЭНЭ', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const { generateKeyPairSync, createPrivateKey } = await import('node:crypto');
    const forge = (await import('node-forge')).default;

    // Тестийн Document-Signer: RSA түлхүүр + өөрөө гарын үсэг зурсан гэрчилгээ.
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.publicKeyFromPem(pubPem);
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 3600_000);
    cert.validity.notAfter = new Date(Date.now() + 3600_000);
    const attrs = [{ name: 'commonName', value: 'Gerege Document Signer' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(forge.pki.privateKeyFromPem(keyPem), forge.md.sha256.create());
    const certPem = forge.pki.certificateToPem(cert);
    // createPrivateKey нь PKCS#1 PEM-ийг ойлгож байгааг батална (форматын шалгалт).
    expect(createPrivateKey(keyPem).type).toBe('private');

    const uc = newSignUsecase(await seedCompleted(), {
      ...cfg,
      signerCertPem: certPem,
      signerKeyPem: keyPem,
    });
    const out = await uc.download(ctx, 'УБ12345678', 'sess-1');
    const text = out.pdf.toString('latin1');
    // PDF дотор гарын үсгийн dictionary болон шалтгаан орсон байх ёстой.
    expect(text).toContain('/Type /Sig');
    expect(text).toContain('/ByteRange');
    expect(out.pdf.length).toBeGreaterThan(1000);
  });

  it('signer тохируулаагүй үед stamp унавал 500 (чимээгүй гарын үсэггүй PDF өгөхгүй)', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const uc = newSignUsecase(await seedCompleted(), cfg);
    await expect(uc.download(ctx, 'УБ12345678', 'sess-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Internal),
    );
  });
});

describe('production-ийн fail-closed', () => {
  it('signer PEM-гүй production-д usecase үүсэхгүй', () => {
    expect(() => newSignUsecase(memoryCache(), { ...cfg, isProduction: true })).toThrow(
      /Document-Signer/,
    );
  });

  it('development-д PEM-гүй ч үүснэ (v3 stamp хэвээр ажиллана)', () => {
    expect(() => newSignUsecase(memoryCache(), cfg)).not.toThrow();
  });
});
