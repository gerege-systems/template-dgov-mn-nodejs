// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// eID байгууллагын төлөөллийн client-ийн unit тестүүд. Гол зорилго: 403 нь
// ЯМАГТ ErrNotRepresentative болж эрхийн шийдвэр IdP-д үлдэх, замын
// параметрүүд зөв escape хийгдэх, PENDING баталгаажуулалт алдагдахгүй байх.

import { describe, expect, it, vi } from 'vitest';

import {
  addRepresentation,
  addSigner,
  ErrNotRepresentative,
  ErrSignerNotEnrolled,
  orgSigners,
  parseRepresentations,
  parseSignersResult,
  removeRepresentation,
  removeSigner,
  representations,
  resendSigner,
  updateOrgNameLatin,
} from './eid_org.js';
import type { EidRequester, EidResponse } from './transport.js';

/** stub нь бүх method-д НЭГ ижил хариу буцаадаг хуурамч transport. */
function stub(res: EidResponse): EidRequester & { calls: [string, string, unknown][] } {
  const calls: [string, string, unknown][] = [];
  const rec =
    (method: string) =>
    (path: string, body?: unknown): Promise<EidResponse> => {
      calls.push([method, path, body]);
      return Promise.resolve(res);
    };
  return {
    calls,
    request: vi.fn(() => Promise.resolve(res)),
    get: rec('GET'),
    post: rec('POST'),
    put: rec('PUT'),
    del: (path: string) => rec('DELETE')(path),
  };
}

const repsBody = JSON.stringify({
  representations: [
    {
      orgEtsi: 'NTRMN-1234567',
      orgRegister: '1234567',
      orgName: 'Гэрэгэ Системс ХХК',
      orgNameEn: 'Gerege Systems LLC',
      role: 'Гүйцэтгэх захирал',
      rightType: 'ADMIN',
      validFrom: '2026-01-01T00:00:00Z',
      validTo: null,
    },
  ],
});

describe('parseRepresentations', () => {
  it('огноог Date болгож, validTo=null-ыг хугацаагүй гэж үзнэ', () => {
    const [rep] = parseRepresentations(repsBody);
    expect(rep?.orgRegister).toBe('1234567');
    expect(rep?.rightType).toBe('ADMIN');
    expect(rep?.validFrom).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(rep?.validTo).toBeNull();
  });

  it('representations талбар байхгүй бол хоосон жагсаалт', () => {
    expect(parseRepresentations('{}')).toEqual([]);
  });

  it('JSON биш бол контексттэй алдаа', () => {
    expect(() => parseRepresentations('<html>')).toThrow(/eid representations: invalid response/);
  });
});

describe('parseSignersResult', () => {
  it('PENDING баталгаажуулалтыг задлана (MANAGER нэмэх урсгал)', () => {
    const res = parseSignersResult(
      JSON.stringify({
        signers: [{ regNo: 'АА00112233', rightType: 'ADMIN', status: 'ACTIVE', self: true }],
        pendingConfirmation: {
          orgRegister: '1234567',
          signerRegNo: 'УY99887766',
          sessionId: 'sess-1',
        },
      }),
    );
    expect(res.signers[0]?.self).toBe(true);
    expect(res.pendingConfirmation?.sessionId).toBe('sess-1');
  });

  it('pendingConfirmation байхгүй бол null', () => {
    expect(parseSignersResult('{"signers":[]}').pendingConfirmation).toBeNull();
  });
});

describe('representations', () => {
  it('personEtsi-г зам дотор escape хийнэ', async () => {
    const http = stub({ raw: repsBody, status: 200 });
    await representations(http, 'PNOMN-АА00112233');
    expect(http.calls[0]?.[1]).toBe(
      `/organization/representations/etsi/${encodeURIComponent('PNOMN-АА00112233')}`,
    );
  });

  it('404 нь АЛДАА БИШ — байгууллага төлөөлдөггүй иргэн хоосон жагсаалт авна', async () => {
    const http = stub({ raw: '', status: 404 });
    await expect(representations(http, 'PNOMN-X')).resolves.toEqual([]);
  });

  it('personEtsi хоосон бол сүлжээнд хүрэхгүй', async () => {
    const http = stub({ raw: '{}', status: 200 });
    await expect(representations(http, '   ')).rejects.toThrow(/empty personEtsi/);
    expect(http.calls).toHaveLength(0);
  });

  it('5xx бол статустай алдаа', async () => {
    const http = stub({ raw: 'boom', status: 503 });
    await expect(representations(http, 'PNOMN-X')).rejects.toThrow(
      /eid representations: status 503/,
    );
  });
});

describe('addRepresentation', () => {
  it('affiliates-ийг хоосон талбаргүйгээр илгээнэ', async () => {
    const http = stub({ raw: repsBody, status: 200 });
    await addRepresentation(http, 'PNOMN-X', {
      orgRegister: ' 1234567 ',
      orgName: ' Гэрэгэ ',
      orgNameEn: '',
      affiliates: [{ regNo: 'АА00112233', kind: 'CEO' }],
    });
    const body = http.calls[0]?.[2] as Record<string, unknown>;
    expect(body.orgRegister).toBe('1234567');
    expect(body.orgName).toBe('Гэрэгэ');
    expect(body).not.toHaveProperty('orgNameEn');
    expect(body.affiliates).toEqual([{ regNo: 'АА00112233', kind: 'CEO' }]);
  });

  it('403 → ErrNotRepresentative (эрхийн шийдвэр улсын бүртгэлд үлдэнэ)', async () => {
    const http = stub({ raw: '', status: 403 });
    await expect(
      addRepresentation(http, 'PNOMN-X', {
        orgRegister: '1234567',
        orgName: 'Т',
        orgNameEn: '',
        affiliates: [],
      }),
    ).rejects.toBeInstanceOf(ErrNotRepresentative);
  });
});

describe('signers', () => {
  it('orgSigners нь 403-д ErrNotRepresentative буцаана', async () => {
    const http = stub({ raw: '', status: 403 });
    await expect(orgSigners(http, '1234567', 'PNOMN-X')).rejects.toBeInstanceOf(
      ErrNotRepresentative,
    );
  });

  it('addSigner нь 404-д ErrSignerNotEnrolled (eID-д бүртгэлгүй иргэн)', async () => {
    const http = stub({ raw: '', status: 404 });
    await expect(
      addSigner(http, '1234567', 'PNOMN-X', { signerRegNo: 'УY99887766', role: '' }),
    ).rejects.toBeInstanceOf(ErrSignerNotEnrolled);
  });

  it('addSigner нь хоосон role-ыг ИЛГЭЭХГҮЙ (эрхийг eidmongolia шийднэ)', async () => {
    const http = stub({ raw: '{"signers":[]}', status: 200 });
    await addSigner(http, '1234567', 'PNOMN-X', { signerRegNo: ' УY99887766 ', role: '  ' });
    const body = http.calls[0]?.[2] as Record<string, unknown>;
    expect(body).toEqual({ signerRegNo: 'УY99887766' });
  });

  it('removeSigner нь signer-ийг query-д тавина', async () => {
    const http = stub({ raw: '{"signers":[]}', status: 200 });
    await removeSigner(http, '1234567', 'PNOMN-X', 'УY99887766');
    expect(http.calls[0]?.[1]).toBe(
      `/organization/signers/1234567/etsi/PNOMN-X?signer=${encodeURIComponent('УY99887766')}`,
    );
  });

  it('resendSigner нь /resend зам руу POST хийнэ', async () => {
    const http = stub({ raw: '{"signers":[]}', status: 200 });
    await resendSigner(http, '1234567', 'PNOMN-X', 'УY99887766');
    expect(http.calls[0]?.[0]).toBe('POST');
    expect(http.calls[0]?.[1]).toContain('/resend?signer=');
  });

  it('resendSigner нь signerRegNo хоосон бол сүлжээнд хүрэхгүй', async () => {
    const http = stub({ raw: '', status: 200 });
    await expect(resendSigner(http, '1234567', 'PNOMN-X', ' ')).rejects.toThrow(
      /empty signerRegNo/,
    );
    expect(http.calls).toHaveLength(0);
  });
});

describe('removeRepresentation / updateOrgNameLatin', () => {
  it('removeRepresentation нь хоёр сегменттэй зам руу DELETE хийнэ', async () => {
    const http = stub({ raw: repsBody, status: 200 });
    await removeRepresentation(http, 'PNOMN-X', '1234567');
    expect(http.calls[0]?.[0]).toBe('DELETE');
    expect(http.calls[0]?.[1]).toBe('/organization/representations/etsi/PNOMN-X/1234567');
  });

  it('updateOrgNameLatin нь PUT + nameLatin body илгээнэ', async () => {
    const http = stub({ raw: repsBody, status: 200 });
    await updateOrgNameLatin(http, '1234567', 'PNOMN-X', '  Gerege Systems LLC  ');
    expect(http.calls[0]?.[0]).toBe('PUT');
    expect(http.calls[0]?.[2]).toEqual({ nameLatin: 'Gerege Systems LLC' });
  });

  it('updateOrgNameLatin нь 403-д ErrNotRepresentative', async () => {
    const http = stub({ raw: '', status: 403 });
    await expect(updateOrgNameLatin(http, '1234567', 'PNOMN-X', 'X')).rejects.toBeInstanceOf(
      ErrNotRepresentative,
    );
  });
});
