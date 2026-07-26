// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /integrations/* route-ийн ХОЛБОЛТЫН тест.
//
// Гол эрсдэл: Express нь ЭХЭЛЖ таарсан route-ыг сонгодог тул `/:provider/token`
// нь `/google-drive/files` зэрэг тодорхой замуудыг залгих боломжтой. Тэр алдаа
// зөвхөн ажиллах үед мэдэгддэг (хариу нь "холбоогүй байна" гэж 404 болно) —
// иймд бодит route гинжийг барина. Мөн OAuth-ийн state (CSRF) шалгалт болон
// нэвтрэлтийн хамгаалалтыг энд баталгаажуулна.

import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppConfig } from '../../config/config.js';
import { background, withUser } from '../../pkg/ctx/ctx.js';
import type { ProviderOps } from '../../usecases/integrations/integrations_provider.js';
import type { IntegrationsUsecase } from '../../usecases/integrations/integrations_usecase.js';
import type { Middleware } from '../types.js';
import type { Deps } from './index.js';
import { registerIntegrationsRoutes } from './route_integrations.js';

let server: ReturnType<express.Express['listen']> | undefined;
let base = '';
let ops: ProviderOps;
let integrationsUC: IntegrationsUsecase;
let driveListMock: ReturnType<typeof vi.fn>;
let tokenMock: ReturnType<typeof vi.fn>;
let connectMock: ReturnType<typeof vi.fn>;

/** savedConfig нь тест эхлэхийн өмнөх интеграцийн тохиргоо. */
const savedConfig = {
  APP_ORIGIN: AppConfig.APP_ORIGIN,
  GOOGLE_DRIVE_CLIENT_ID: AppConfig.GOOGLE_DRIVE_CLIENT_ID,
  GOOGLE_DRIVE_CLIENT_SECRET: AppConfig.GOOGLE_DRIVE_CLIENT_SECRET,
};

/** authAsUser нь бодит authMiddleware шиг ctx-д хэрэглэгч тавина. */
const authAsUser: Middleware = (req, _res, next) => {
  req.currentUser = { id: 'u-1', email: 'a@b.mn', isAdmin: false, roleId: 3, jti: 'j-1' };
  req.ctx = withUser(background(), 'u-1');
  next();
};

async function boot(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.ctx = background();
    next();
  });

  const deps = {
    integrationsUC,
    providerOps: ops,
    authMiddleware: authAsUser,
  } as unknown as Deps;

  const v1 = express.Router();
  registerIntegrationsRoutes(v1, deps);
  app.use('/api/v1', v1);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server?.address() as AddressInfo;
  base = `http://127.0.0.1:${String(addr.port)}/api/v1`;
}

beforeEach(async () => {
  driveListMock = vi.fn(() => Promise.resolve([{ id: 'f1', name: 'a.pdf' }]));
  tokenMock = vi.fn(() =>
    Promise.resolve({ accessToken: 'at', refreshToken: 'rt', expiresAt: null }),
  );
  connectMock = vi.fn(() => Promise.resolve());
  ops = {
    driveList: driveListMock,
    driveUploadFile: vi.fn(),
    driveUploadImage: vi.fn(() => Promise.resolve('https://lh3.googleusercontent.com/d/x')),
    driveRenameFile: vi.fn(),
    driveDeleteFile: vi.fn(() => Promise.resolve()),
    dropboxListFiles: vi.fn(() => Promise.resolve([])),
    dropboxPreviewLink: vi.fn(() => Promise.resolve('https://dl/x')),
    dropboxUploadFile: vi.fn(() => Promise.resolve({})),
    meetCreate: vi.fn(() => Promise.resolve({ meetingUri: 'https://meet/x', meetingCode: 'x' })),
  };
  integrationsUC = {
    connect: connectMock,
    list: vi.fn(() => Promise.resolve([])),
    disconnect: vi.fn(() => Promise.resolve()),
    token: tokenMock,
  };
  await boot();
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
  server = undefined;
  // AppConfig нь процессын хэмжээний нэг объект — тестийн дараа сэргээж,
  // хөрш тестүүд рүү тохиргоо "гоожихоос" сэргийлнэ.
  Object.assign(AppConfig, savedConfig);
});

describe('route-ийн эрэмбэ', () => {
  it('/google-drive/files нь /:provider/token-д ЗАЛГИГДАХГҮЙ', async () => {
    const res = await fetch(`${base}/integrations/google-drive/files`);
    expect(res.status).toBe(200);
    expect(driveListMock).toHaveBeenCalledOnce();
    // Токен буцаадаг handler дуудагдвал эрэмбэ буруу.
    expect(tokenMock).not.toHaveBeenCalled();
  });

  it('/dropbox/preview нь замын шалгалттай handler руу очно', async () => {
    const res = await fetch(`${base}/integrations/dropbox/preview?path=/Gerege/a.png`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { link?: string } };
    expect(body.data?.link).toBe('https://dl/x');
  });

  it('/:provider/token нь ХЭВЭЭР ажиллана (хуучин гэрээ)', async () => {
    const res = await fetch(`${base}/integrations/dropbox/token`);
    expect(res.status).toBe(200);
    expect(tokenMock).toHaveBeenCalledOnce();
  });
});

describe('OAuth connect', () => {
  it('танихгүй провайдерыг алдаатай буцаана', async () => {
    const res = await fetch(`${base}/integrations/nope/connect`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=unknown_provider');
  });

  it('тохируулаагүй провайдер дээр authorize руу ЯВУУЛАХГҮЙ', async () => {
    AppConfig.APP_ORIGIN = 'https://example.mn';
    AppConfig.GOOGLE_DRIVE_CLIENT_ID = '';
    AppConfig.GOOGLE_DRIVE_CLIENT_SECRET = '';
    const res = await fetch(`${base}/integrations/google-drive/connect`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('error=not_configured');
    expect(loc).not.toContain('accounts.google.com');
  });

  it('тохируулагдсан үед authorize URL руу state-тэйгээр чиглүүлж, cookie тавина', async () => {
    AppConfig.APP_ORIGIN = 'https://example.mn';
    AppConfig.GOOGLE_DRIVE_CLIENT_ID = 'cid';
    AppConfig.GOOGLE_DRIVE_CLIENT_SECRET = 'secret';
    const res = await fetch(`${base}/integrations/google-drive/connect`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location') ?? '');
    expect(loc.host).toBe('accounts.google.com');
    expect(loc.searchParams.get('client_id')).toBe('cid');
    expect(loc.searchParams.get('redirect_uri')).toBe(
      'https://example.mn/api/v1/integrations/google-drive/callback',
    );
    const state = loc.searchParams.get('state') ?? '';
    expect(state).toHaveLength(32);
    // client_secret нь authorize URL-д ХЭЗЭЭ Ч гарах ёсгүй.
    expect(loc.searchParams.get('client_secret')).toBeNull();
    expect(res.headers.get('set-cookie') ?? '').toContain(`dgov_oauth_google-drive=${state}`);
  });
});

describe('OAuth callback', () => {
  beforeEach(() => {
    AppConfig.APP_ORIGIN = 'https://example.mn';
    AppConfig.GOOGLE_DRIVE_CLIENT_ID = 'cid';
    AppConfig.GOOGLE_DRIVE_CLIENT_SECRET = 'secret';
  });

  it('state cookie БАЙХГҮЙ бол токен солилцохгүй (CSRF)', async () => {
    const res = await fetch(`${base}/integrations/google-drive/callback?code=c&state=s`, {
      redirect: 'manual',
    });
    expect(res.headers.get('location')).toContain('error=invalid_state');
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('state ЗӨРВӨЛ токен солилцохгүй', async () => {
    const res = await fetch(`${base}/integrations/google-drive/callback?code=c&state=aaa`, {
      redirect: 'manual',
      headers: { cookie: 'dgov_oauth_google-drive=bbb' },
    });
    expect(res.headers.get('location')).toContain('error=invalid_state');
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('провайдер цуцалсан бол denied-ээр буцна', async () => {
    const res = await fetch(`${base}/integrations/google-drive/callback?error=access_denied`, {
      redirect: 'manual',
    });
    expect(res.headers.get('location')).toContain('error=denied');
    expect(connectMock).not.toHaveBeenCalled();
  });
});
