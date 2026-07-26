// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// eID RP client-ийн unit тестүүд. Гол зорилго нь IdP-ийн wire формат → template-ийн
// энгийн төлөв рүү буулгах ЛОГИК: COMPLETE хариу нь өөрөө амжилтыг заадаггүй —
// жинхэнэ үр дүн result.endResult-д байдаг.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ErrInitiateRejected,
  StateComplete,
  StateExpired,
  StateRefused,
  StateRunning,
  newEidClient,
  parseCertificate,
  parseVC,
} from './eid.js';

/**
 * testCertB64 — openssl-ээр гаргасан ECDSA P-256 self-signed сертификат
 * (CN=Test eID CA, serial=0x1a2b3c). Жинхэнэ иргэний cert БИШ, зөвхөн X.509
 * задлагчийг шалгах фикстур.
 */
const testCertB64 =
  'MIIBjjCCATSgAwIBAgIDGis8MAoGCCqGSM49BAMCMCUxFDASBgNVBAMMC1Rlc3QgZUlEIENBMQ0wCwYDVQQKDARUZXN0MB4XDTI2MDcyNTEzMTg1NVoXDTM2MDcyMjEzMTg1NVowJTEUMBIGA1UEAwwLVGVzdCBlSUQgQ0ExDTALBgNVBAoMBFRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQ8t8NzRVoHtorFVpZcTwXCK8XUNJ8Cde3Xi1jeXNXIaqRekhtL9c5utHE4UkpHV+DeaLDuUx1WjvcMdi+fvMuFo1MwUTAdBgNVHQ4EFgQUt+DQBB5DEw3orqna3v48LTWPF9EwHwYDVR0jBBgwFoAUt+DQBB5DEw3orqna3v48LTWPF9EwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiBl4SSu60O2HM+2f8wwGDEzi4F+cSoXCt3aLrbv9b2U+wIhAP+nDfsHurvIVwRPAnV2NaQ0KMaEkB9nIk0JJ5wC4XDE';

/** mockFetch нь дараалсан хариунуудыг буцаах fetch-ийг тавина. */
function mockFetch(responses: { status: number; body: unknown }[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      status: r.status,
      arrayBuffer: () =>
        Promise.resolve(
          new TextEncoder().encode(typeof r.body === 'string' ? r.body : JSON.stringify(r.body))
            .buffer,
        ),
    });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

const client = () => newEidClient('https://idp.test/v3', 'rp-uuid', 'test-rp', 'rp_sk_secret', '');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseVC', () => {
  it('anonymous-ийн шууд мөрийг уншина', () => {
    expect(parseVC('7270')).toBe('7270');
  });

  it('notification-ийн {type,value} объектыг уншина', () => {
    expect(parseVC({ type: 'alphaNumeric4', value: '0489' })).toBe('0489');
  });

  it('байхгүй/танихгүй хэлбэрт хоосон буцаана', () => {
    expect(parseVC(undefined)).toBe('');
    expect(parseVC(null)).toBe('');
    expect(parseVC(42)).toBe('');
  });
});

describe('parseCertificate', () => {
  it('ECDSA сертификатын нээлттэй хэсгийг задална', () => {
    const cert = parseCertificate(testCertB64);
    expect(cert).not.toBeNull();
    // Go-ийн SerialNumber.Text(16)-тай ижил: жижиг үсэг, эхний тэггүй.
    expect(cert?.serial).toBe('1a2b3c');
    expect(cert?.issuer).toBe('Test eID CA');
    expect(cert?.keyType).toBe('ECDSA P-256');
    expect(cert?.notBefore).toBeInstanceOf(Date);
    expect(cert?.notAfter.getTime()).toBeGreaterThan(cert!.notBefore.getTime());
  });

  it('хоосон/эвдэрсэн cert дээр null буцаана (нэвтрэлтэд саад болохгүй)', () => {
    expect(parseCertificate('')).toBeNull();
    expect(parseCertificate('   ')).toBeNull();
    expect(parseCertificate('bm90LWEtY2VydA==')).toBeNull();
  });
});

describe('session — төлвийн буулгалт', () => {
  it('RUNNING-ийг дамжуулна', async () => {
    mockFetch([{ status: 200, body: { state: 'RUNNING' } }]);
    const res = await client().session('sid', 25000);
    expect(res.state).toBe(StateRunning);
    expect(res.identity).toBeNull();
  });

  it('COMPLETE + endResult=OK → identity бүхий COMPLETE', async () => {
    mockFetch([
      {
        status: 200,
        body: {
          state: 'COMPLETE',
          result: { endResult: 'OK', documentNumber: 'DEV-1' },
          cert: { value: testCertB64, certificateLevel: 'QUALIFIED' },
          person: {
            givenName: 'Бат',
            surname: 'Дорж',
            givenNameEn: 'Bat',
            surnameEn: 'Dorj',
            civilId: 'AB12345678',
            regNo: 'ЎЙ99887766',
          },
        },
      },
    ]);
    const res = await client().session('sid', 25000);
    expect(res.state).toBe(StateComplete);
    expect(res.identity?.civilId).toBe('AB12345678');
    expect(res.identity?.nationalId).toBe('ЎЙ99887766');
    expect(res.identity?.givenName).toBe('Бат');
    expect(res.identity?.kycLevel).toBe('QUALIFIED');
    expect(res.identity?.documentNumber).toBe('DEV-1');
    expect(res.identity?.certificate?.issuer).toBe('Test eID CA');
  });

  it('COMPLETE + endResult=TIMEOUT → EXPIRED', async () => {
    mockFetch([{ status: 200, body: { state: 'COMPLETE', result: { endResult: 'TIMEOUT' } } }]);
    expect((await client().session('sid', 25000)).state).toBe(StateExpired);
  });

  it('COMPLETE + USER_REFUSED → REFUSED', async () => {
    mockFetch([
      { status: 200, body: { state: 'COMPLETE', result: { endResult: 'USER_REFUSED_VC_CHOICE' } } },
    ]);
    expect((await client().session('sid', 25000)).state).toBe(StateRefused);
  });

  it('COMPLETE + WRONG_VC → REFUSED', async () => {
    mockFetch([{ status: 200, body: { state: 'COMPLETE', result: { endResult: 'WRONG_VC' } } }]);
    expect((await client().session('sid', 25000)).state).toBe(StateRefused);
  });

  it('COMPLETE + OK боловч person блокгүй бол алдаа (чимээгүй нэвтрүүлэхгүй)', async () => {
    mockFetch([{ status: 200, body: { state: 'COMPLETE', result: { endResult: 'OK' } } }]);
    await expect(client().session('sid', 25000)).rejects.toThrow(/without person block/);
  });

  it('хоосон session_id-г татгалзана', async () => {
    await expect(client().session('', 25000)).rejects.toThrow(/empty session_id/);
  });

  it('3xx+ статусыг алдаа болгоно', async () => {
    mockFetch([{ status: 500, body: 'boom' }]);
    await expect(client().session('sid', 25000)).rejects.toThrow(/status 500/);
  });
});

describe('initiate', () => {
  it('QR нэвтрэлт эхлүүлж sessionID-г QR агуулга болгон буцаана', async () => {
    const fetchMock = mockFetch([{ status: 200, body: { sessionID: 'sess-123', vc: '7270' } }]);
    const res = await client().qrInitiate('node.template.dgov.mn', '');
    expect(res.sessionId).toBe('sess-123');
    expect(res.verificationCode).toBe('7270');
    // QR-д кодлох агуулга нь device-link URL БИШ, зүгээр session UUID.
    expect(res.deviceLinkUrl).toBe('sess-123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://idp.test/v3/authentication/device-link/anonymous');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer rp_sk_secret');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    // ACSP_V2-д challenge талбар нь rpChallenge (hash/digest БИШ).
    expect(body.signatureProtocol).toBe('ACSP_V2');
    expect(typeof body.rpChallenge).toBe('string');
    expect((body.rpChallenge as string).length).toBeGreaterThan(0);
    expect(body.interactions).toEqual([
      { type: 'displayTextAndPIN', displayText60: 'node.template.dgov.mn' },
    ]);
    // CROSS-DEVICE: callbackUrl хоосон бол талбар огт орохгүй.
    expect(body.initialCallbackUrl).toBeUndefined();
  });

  it('РД push-д ETSI semantics identifier (PNOMN-) хэрэглэнэ', async () => {
    const fetchMock = mockFetch([
      { status: 200, body: { sessionID: 'sess-9', vc: { type: 'alphaNumeric4', value: '0489' } } },
    ]);
    const res = await client().initiate('ЎЙ99887766', 'дэлгэц', '');
    expect(res.sessionId).toBe('sess-9');
    expect(res.verificationCode).toBe('0489');
    // РД push-д device link байхгүй.
    expect(res.deviceLinkUrl).toBe('');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/authentication/notification/etsi/PNOMN-');
    expect(url).toContain(encodeURIComponent('ЎЙ99887766'));
  });

  it('SAME-DEVICE үед initialCallbackUrl-ийг илгээнэ', async () => {
    const fetchMock = mockFetch([{ status: 200, body: { sessionID: 's', vc: '1' } }]);
    await client().qrInitiate('t', 'https://node.template.dgov.mn/login/verify');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.initialCallbackUrl).toBe('https://node.template.dgov.mn/login/verify');
  });

  it('displayText-ийг 60 тэмдэгтэд хязгаарлана', async () => {
    const fetchMock = mockFetch([{ status: 200, body: { sessionID: 's', vc: '1' } }]);
    await client().qrInitiate('x'.repeat(100), '');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect((body.interactions as Interaction[])[0]?.displayText60).toHaveLength(60);
  });

  it('4xx-ийг ErrInitiateRejected болгоно (5xx дотоод алдаанаас ЯЛГААТАЙ)', async () => {
    mockFetch([{ status: 400, body: { error: 'bad national id' } }]);
    await expect(client().initiate('bad', 't', '')).rejects.toThrow(ErrInitiateRejected);
  });

  it('5xx-ийг ерөнхий алдаа болгоно', async () => {
    mockFetch([{ status: 503, body: 'upstream down' }]);
    await expect(client().qrInitiate('t', '')).rejects.toThrow(/status 503/);
  });

  it('sessionID хоосон хариуг татгалзана', async () => {
    mockFetch([{ status: 200, body: { vc: '1' } }]);
    await expect(client().qrInitiate('t', '')).rejects.toThrow(/empty\/invalid sessionID/);
  });
});

interface Interaction {
  type: string;
  displayText60?: string;
}
