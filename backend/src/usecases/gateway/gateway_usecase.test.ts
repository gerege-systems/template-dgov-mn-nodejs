// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Gateway usecase + лог middleware-ийн шүүлтүүрийн unit тестүүд. Гол зорилго:
// дутуу форм ажиллах чадвартай мөр болж хэвийших, лог нь ЗӨВХӨН гуравдагч
// талын RP-ийн замыг барих, лог бичилт хүсэлтийг хэзээ ч унагахгүй байх.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type {
  GatewayRepository,
  NewGatewayService,
} from '../../datasources/repositories/interface/gateway.js';
import type { GatewayService } from '../../domain/gateway.js';
import { cleanTags } from '../../domain/gateway.js';
import { isRPGatewayPath } from '../../http/middlewares/gateway_log.js';
import { background } from '../../pkg/ctx/ctx.js';
import { newGatewayUsecase, type ServiceInput } from './gateway_usecase.js';

function service(over: Partial<GatewayService> = {}): GatewayService {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'billing',
    protocol: 'https',
    host: 'api.example.mn',
    port: 443,
    path: '/',
    retries: 0,
    connectTimeout: 60_000,
    tags: [],
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: null,
    ...over,
  };
}

function input(over: Partial<ServiceInput> = {}): ServiceInput {
  return {
    name: 'billing',
    protocol: '',
    host: 'api.example.mn',
    port: 0,
    path: '',
    retries: 0,
    connectTimeout: 0,
    tags: [],
    enabled: true,
    ...over,
  };
}

function mockRepo(over: Partial<GatewayRepository> = {}): GatewayRepository {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    listServices: vi.fn(() => Promise.resolve([service()])),
    getService: vi.fn(no),
    createService: vi.fn(() => Promise.resolve(service())),
    updateService: vi.fn(() => Promise.resolve(service())),
    deleteService: vi.fn(() => Promise.resolve()),
    listRequestLogs: vi.fn(() => Promise.resolve([])),
    createRequestLog: vi.fn(() => Promise.resolve()),
    overview: vi.fn(no),
    ...over,
  };
}

describe('cleanTags', () => {
  it('хоосон/давхардсаныг хасаж ЭРЭМБЭ хадгална', () => {
    expect(cleanTags([' a ', '', 'b', 'a', '  '])).toEqual(['a', 'b']);
  });
});

describe('service-ийн хэвийшүүлэлт', () => {
  it('дутуу талбарууд ажиллах чадвартай өгөгдмөл авна', async () => {
    const createService = vi.fn((_ctx: unknown, _in: NewGatewayService) =>
      Promise.resolve(service()),
    );
    const uc = newGatewayUsecase(mockRepo({ createService }));

    await uc.createService(background(), input());

    expect(createService.mock.calls[0]?.[1]).toEqual({
      name: 'billing',
      // Танихгүй протокол → https (аюулгүй тал).
      protocol: 'https',
      host: 'api.example.mn',
      // Порт хүрээнээс гадуур → протоколын өгөгдмөл.
      port: 443,
      path: '/',
      retries: 0,
      connectTimeout: 60_000,
      tags: [],
      enabled: true,
    });
  });

  it('http протоколд өгөгдмөл порт нь 80', async () => {
    const createService = vi.fn((_ctx: unknown, _in: NewGatewayService) =>
      Promise.resolve(service()),
    );
    const uc = newGatewayUsecase(mockRepo({ createService }));

    await uc.createService(background(), input({ protocol: ' HTTP ', port: 99999 }));

    expect(createService.mock.calls[0]?.[1].protocol).toBe('http');
    expect(createService.mock.calls[0]?.[1].port).toBe(80);
  });

  it('нэр эсвэл host хоосон бол 400 — DB-д хүрэхгүй', async () => {
    const createService = vi.fn(() => Promise.resolve(service()));
    const uc = newGatewayUsecase(mockRepo({ createService }));

    await expect(uc.createService(background(), input({ name: '  ' }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    await expect(uc.createService(background(), input({ host: '' }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(createService).not.toHaveBeenCalled();
  });

  it('сөрөг retries нь 0 болно', async () => {
    const createService = vi.fn((_ctx: unknown, _in: NewGatewayService) =>
      Promise.resolve(service()),
    );
    const uc = newGatewayUsecase(mockRepo({ createService }));

    await uc.createService(background(), input({ retries: -3 }));

    expect(createService.mock.calls[0]?.[1].retries).toBe(0);
  });

  it('шинэчлэхэд ч ижил хэвийшүүлэлт хэрэглэгдэнэ', async () => {
    const updateService = vi.fn((_ctx: unknown, _id: string, _in: NewGatewayService) =>
      Promise.resolve(service()),
    );
    const uc = newGatewayUsecase(mockRepo({ updateService }));

    await uc.updateService(background(), 'svc-1', input({ path: '  /v2 ' }));

    expect(updateService.mock.calls[0]?.[1]).toBe('svc-1');
    expect(updateService.mock.calls[0]?.[2].path).toBe('/v2');
  });
});

describe('хүсэлтийн лог', () => {
  it('limit хүрээнээс гарвал 100 болно', async () => {
    const listRequestLogs = vi.fn((_ctx: unknown, _limit: number) => Promise.resolve([]));
    const uc = newGatewayUsecase(mockRepo({ listRequestLogs }));

    await uc.listRequestLogs(background(), 0);
    await uc.listRequestLogs(background(), 5000);
    await uc.listRequestLogs(background(), 25);

    expect(listRequestLogs.mock.calls.map((c) => c[1])).toEqual([100, 100, 25]);
  });

  it('лог бичилт DB унасан ч алдаа ШИДЭХГҮЙ (хүсэлт блоклогдохгүй)', async () => {
    const uc = newGatewayUsecase(
      mockRepo({ createRequestLog: vi.fn(() => Promise.reject(new Error('db down'))) }),
    );

    expect(() =>
      uc.recordRequest(background(), {
        method: 'POST',
        path: '/rp/sign/start',
        status: 200,
        latencyMs: 12,
        clientIp: '203.0.113.7',
      }),
    ).not.toThrow();
    // Баригдаагүй promise үлдээгүйг баталгаажуулна.
    await new Promise((r) => setImmediate(r));
  });
});

describe('лог-ийн замын шүүлтүүр', () => {
  it('ЗӨВХӨН гуравдагч талын RP-ийн замыг барина', () => {
    expect(isRPGatewayPath('/rp/sign/start')).toBe(true);
    expect(isRPGatewayPath('/api/v1/provider/authorize')).toBe(true);
  });

  it('платформын ӨӨРИЙН дотоод API лог-д ОРОХГҮЙ', () => {
    for (const p of [
      '/api/v1/users/me',
      '/api/v1/rbac/roles',
      '/api/v1/gateway/overview',
      '/api/v1/themes/active',
      '/health',
    ]) {
      expect(isRPGatewayPath(p)).toBe(false);
    }
  });
});
