// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Route-ийн ХОЛБОЛТЫН тест: аль middleware аль route-д хэрэгжиж байгааг шалгана.
//
// Яагаад хэрэгтэй вэ: chi-д `r.Group(...)` нь middleware-ийг зөвхөн тэр бүлгийн
// route-уудад хэрэглэдэг; Express-д `router.use(subRouter)` нь дэд router-ийн
// `use()`-г тэр цэгээс хойших БҮХ хүсэлтэд ажиллуулна. Тэр зөрүү нь ажиллах үед
// л мэдэгддэг хоёр алдаа гаргасан:
//   1. authMiddleware нь /eid/poll руу гоожиж нэвтрэлтийг 401 болгосон;
//   2. чанга (5/мин) limiter нь /eid/poll-д хүрч, long-poll байнга 429 болох
//      нөхцөл үүсгэсэн.
// Эдгээрийг unit тест барихгүй — route-ийн бодит гинжийг л барина.

import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { background } from '../../pkg/ctx/ctx.js';
import type { AuthUsecase } from '../../usecases/auth/auth_usecase.js';
import type { Middleware } from '../types.js';
import { registerAuthRoutes } from './route_auth.js';
import type { Deps } from './index.js';

/** spyMiddleware нь дуудагдсан эсэхийг тэмдэглээд шууд дамжуулна. */
function spyMiddleware(): { mw: Middleware; calls: () => number } {
  const fn = vi.fn<Middleware>((_req, _res, next) => {
    next();
  });
  return { mw: fn, calls: () => fn.mock.calls.length };
}

/** blockingAuth нь бодит authMiddleware шиг 401-ээр таслана. */
function blockingAuth(): { mw: Middleware; calls: () => number } {
  const fn = vi.fn<Middleware>((_req, res) => {
    res.status(401).json({ status: false, message: 'missing authorization header' });
  });
  return { mw: fn, calls: () => fn.mock.calls.length };
}

let server: ReturnType<express.Express['listen']> | undefined;
let base = '';

let authMw: ReturnType<typeof blockingAuth>;
let strictLimiter: ReturnType<typeof spyMiddleware>;
let pollLimiter: ReturnType<typeof spyMiddleware>;
let authUC: AuthUsecase;

// Mock-уудыг ил хувьсагчид хадгална — assertion-д `authUC.method` гэж объектоос
// салгаж авбал eslint-ийн unbound-method дүрэм зөв гомдоно (`this` алдагдах
// эрсдэл). Ил reference нь тэр асуудлыг үндсээр таслана.
let eidStartMock: ReturnType<typeof vi.fn>;
let eidPollMock: ReturnType<typeof vi.fn>;
let unlinkMock: ReturnType<typeof vi.fn>;

async function boot(): Promise<void> {
  const app = express();
  app.use(express.json());
  // requestId middleware-ийн оронд ctx-ийг гараар тавина.
  app.use((req, _res, next) => {
    req.ctx = background();
    next();
  });

  const deps = {
    authUC,
    authMiddleware: authMw.mw,
    authRateLimiter: { middleware: () => strictLimiter.mw },
    pollRateLimiter: { middleware: () => pollLimiter.mw },
  } as unknown as Deps;

  const v1 = express.Router();
  registerAuthRoutes(v1, deps);
  app.use('/api/v1', v1);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server?.address() as AddressInfo;
  base = `http://127.0.0.1:${String(addr.port)}/api/v1`;
}

beforeEach(async () => {
  authMw = blockingAuth();
  strictLimiter = spyMiddleware();
  pollLimiter = spyMiddleware();
  eidStartMock = vi.fn(() =>
    Promise.resolve({
      sessionId: 's1',
      deviceLinkUrl: 's1',
      verificationCode: '1234',
      expiresAt: '',
    }),
  );
  eidPollMock = vi.fn(() =>
    Promise.resolve({
      state: 'RUNNING',
      user: null,
      mfaRequired: false,
      mfaToken: '',
      accessToken: '',
      refreshToken: '',
    }),
  );
  unlinkMock = vi.fn(() => Promise.resolve());
  // eID профайлын method-ууд энэ route-ийн тестэд дуудагддаггүй тул stub.
  const notUsed = () => Promise.reject(new Error('not stubbed'));
  authUC = {
    eidRepresentations: vi.fn(notUsed),
    registerEidOrganization: vi.fn(notUsed),
    unlinkEidOrganization: vi.fn(notUsed),
    listEidOrgSigners: vi.fn(notUsed),
    addEidOrgSigner: vi.fn(notUsed),
    resendEidOrgSigner: vi.fn(notUsed),
    removeEidOrgSigner: vi.fn(notUsed),
    eidSummary: vi.fn(notUsed),
    eidCertificates: vi.fn(notUsed),
    eidDevices: vi.fn(notUsed),
    eidActivity: vi.fn(notUsed),
    eidStart: eidStartMock,
    eidStartByNationalId: vi.fn(() =>
      Promise.resolve({
        sessionId: 's2',
        deviceLinkUrl: '',
        verificationCode: '5678',
        expiresAt: '',
      }),
    ),
    eidPoll: eidPollMock,
    googleLogin: vi.fn(),
    unlinkGoogleFromUser: unlinkMock,
    refresh: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
  };
  await boot();
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
  server = undefined;
});

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/auth route-ийн middleware хүрээ', () => {
  it('/eid/poll нь authMiddleware-ээр ХАМГААЛАГДААГҮЙ (нэвтрэхээс өмнөх урсгал)', async () => {
    const res = await post('/auth/eid/poll', { session_id: 'abc' });
    expect(res.status).toBe(200);
    expect(authMw.calls()).toBe(0);
    expect(eidPollMock).toHaveBeenCalledOnce();
  });

  it('/eid/poll нь ЗӨВХӨН сул limiter-т хамаарна (чанга limiter хүрэхгүй)', async () => {
    await post('/auth/eid/poll', { session_id: 'abc' });
    expect(pollLimiter.calls()).toBe(1);
    expect(strictLimiter.calls()).toBe(0);
  });

  for (const path of ['/auth/eid/start', '/auth/eid/start-id', '/auth/refresh', '/auth/logout']) {
    it(`${path} нь чанга limiter-т хамаарч, authMiddleware-ээр хаагдахгүй`, async () => {
      await post(path, { national_id: 'x', refresh_token: 'x' });
      expect(strictLimiter.calls()).toBe(1);
      expect(pollLimiter.calls()).toBe(0);
      expect(authMw.calls()).toBe(0);
    });
  }

  it('DELETE /google/link нь authMiddleware-ЭЭР хамгаалагдсан', async () => {
    const res = await fetch(`${base}/auth/google/link`, { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(authMw.calls()).toBe(1);
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it('DELETE /google/link дээр rate limiter хэрэгжихгүй', async () => {
    await fetch(`${base}/auth/google/link`, { method: 'DELETE' });
    expect(strictLimiter.calls()).toBe(0);
    expect(pollLimiter.calls()).toBe(0);
  });

  it('/eid/start body-гүй ч ажиллана (CROSS-DEVICE, desktop QR)', async () => {
    const res = await fetch(`${base}/auth/eid/start`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(eidStartMock).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('танихгүй талбарыг 422-оор татгалзана (strictObject)', async () => {
    const res = await post('/auth/eid/poll', { session_id: 'abc', evil: 1 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { data?: { errors?: { tag?: string }[] } };
    expect(body.data?.errors?.[0]?.tag).toBe('unknown_field');
  });

  it('session_id дутуу бол 422 талбарын дэлгэрэнгүйтэй', async () => {
    const res = await post('/auth/eid/poll', {});
    expect(res.status).toBe(422);
    const body = (await res.json()) as { data?: { errors?: { field?: string }[] } };
    expect(body.data?.errors?.[0]?.field).toBe('session_id');
  });
});
