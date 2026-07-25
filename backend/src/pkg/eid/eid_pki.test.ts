// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Иргэний PKI самбарын client-ийн unit тестүүд. Гол зорилго: PKI_READ эрхгүй
// RP (403) нь ялгаатай алдаа авах, өгөгдөл олдоогүй (404) нь ТЭГ утга болох,
// upstream-ийн ТАНИХГҮЙ талбарууд алдагдахгүй байх.

import { describe, expect, it, vi } from 'vitest';

import {
  ErrPKINotPermitted,
  personActivity,
  personCertificates,
  personDevices,
  personSummary,
} from './eid_pki.js';
import type { EidRequester, EidResponse } from './transport.js';

function stub(res: EidResponse): EidRequester & { paths: string[] } {
  const paths: string[] = [];
  const get = (path: string): Promise<EidResponse> => {
    paths.push(path);
    return Promise.resolve(res);
  };
  return {
    paths,
    request: vi.fn(() => Promise.resolve(res)),
    get,
    post: vi.fn(() => Promise.resolve(res)),
    put: vi.fn(() => Promise.resolve(res)),
    del: vi.fn(() => Promise.resolve(res)),
  };
}

describe('PKI эрхийн зан үйл', () => {
  it('403 → ErrPKINotPermitted (RP-д PKI_READ эрх олгогдоогүй)', async () => {
    const http = stub({ raw: '', status: 403 });
    await expect(personSummary(http, 'PNOMN-X')).rejects.toBeInstanceOf(ErrPKINotPermitted);
  });

  it('404 нь АЛДАА БИШ — тэг утгатай бүтэц буцна', async () => {
    const http = stub({ raw: '', status: 404 });
    await expect(personCertificates(http, 'PNOMN-X')).resolves.toEqual({
      counts: { valid: 0, revoked: 0, expired: 0, suspended: 0, total: 0 },
      certificates: [],
    });
    await expect(personDevices(http, 'PNOMN-X')).resolves.toEqual({
      devices: [],
      activeCount: 0,
      total: 0,
    });
  });

  it('5xx бол статустай алдаа', async () => {
    const http = stub({ raw: 'boom', status: 500 });
    await expect(personDevices(http, 'PNOMN-X')).rejects.toThrow(/eid pki: status 500/);
  });

  it('personEtsi хоосон бол сүлжээнд хүрэхгүй', async () => {
    const http = stub({ raw: '{}', status: 200 });
    await expect(personSummary(http, ' ')).rejects.toThrow(/empty personEtsi/);
    expect(http.paths).toHaveLength(0);
  });
});

describe('PKI замууд', () => {
  it('гэрчилгээ / төхөөрөмж / activity / summary тус бүр өөрийн замтай', async () => {
    const http = stub({ raw: '{}', status: 200 });
    await personSummary(http, 'PNOMN-X');
    await personCertificates(http, 'PNOMN-X');
    await personDevices(http, 'PNOMN-X');
    await personActivity(http, 'PNOMN-X', 0, 0);
    expect(http.paths).toEqual([
      '/person/summary/etsi/PNOMN-X',
      '/certificates/etsi/PNOMN-X',
      '/devices/etsi/PNOMN-X',
      // limit<=0 бол өгөгдмөл 20.
      '/rp/activity/etsi/PNOMN-X?limit=20&offset=0',
    ]);
  });

  it('activity нь limit/offset-ийг хүндэтгэнэ', async () => {
    const http = stub({ raw: '{}', status: 200 });
    await personActivity(http, 'PNOMN-X', 5, 40);
    expect(http.paths[0]).toBe('/rp/activity/etsi/PNOMN-X?limit=5&offset=40');
  });
});

describe('танихгүй талбарууд', () => {
  it('activity бичлэгийн НЭМЭЛТ талбарууд хэвээр үлдэнэ ("бүгдийг харуул")', async () => {
    const http = stub({
      status: 200,
      raw: JSON.stringify({
        counts: { authentication: 1, signature: 0 },
        total: 1,
        sessions: [
          {
            sessionId: 's1',
            flow: 'AUTHENTICATION',
            outcome: 'OK',
            timestamp: '2026-07-25T10:00:00Z',
            // upstream дараа нэмсэн талбар:
            ipAddress: '203.0.113.7',
          },
        ],
      }),
    });
    const out = await personActivity(http, 'PNOMN-X', 20, 0);
    expect(out.sessions[0]?.sessionId).toBe('s1');
    expect(out.sessions[0]?.ipAddress).toBe('203.0.113.7');
  });

  it('төхөөрөмжийн нэмэлт талбарууд ч хэвээр үлдэнэ', async () => {
    const http = stub({
      status: 200,
      raw: JSON.stringify({
        activeCount: 1,
        total: 1,
        devices: [{ documentNumber: 'D1', platform: 'APNS', active: true, model: 'iPhone 15' }],
      }),
    });
    const out = await personDevices(http, 'PNOMN-X');
    expect(out.devices[0]?.model).toBe('iPhone 15');
  });
});
