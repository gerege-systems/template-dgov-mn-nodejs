// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Session cookie болон CSRF давхаргын тестүүд. Гол баталгаанууд:
//   • токен cookie нь httpOnly (ЖС уншихгүй), CSRF cookie нь уншигдана;
//   • production-д Secure флаг ҮРГЭЛЖ асна (fail-closed);
//   • cookie-гоор баталгаажсан мутацийн хүсэлт CSRF толгойгүй бол 403;
//   • Bearer токентой хүсэлт CSRF шалгалтад ХАМААРАХГҮЙ.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppConfig } from '../config/config.js';
import {
  AccessCookie,
  clearSessionCookies,
  CsrfCookie,
  CsrfHeader,
  issueSessionCookies,
  RefreshCookie,
  SsoLogoutCookie,
} from './cookies.js';
import { csrfMiddleware } from './middlewares/csrf.js';
import type { Request, Response } from './types.js';

/** fakeRes нь Set-Cookie толгойг цуглуулдаг хамгийн бага Response. */
function fakeRes(): Response & { cookies: () => string[]; statusCode: number; body: unknown } {
  const headers = new Map<string, string | string[]>();
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    getHeader: (k: string) => headers.get(k),
    setHeader: (k: string, v: string | string[]) => {
      headers.set(k, v);
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    type: () => res,
    send(payload: unknown) {
      res.body = payload;
      return res;
    },
    cookies: () => {
      const v = headers.get('Set-Cookie');
      if (v === undefined) return [];
      return Array.isArray(v) ? v : [v];
    },
  };
  return res as unknown as Response & {
    cookies: () => string[];
    statusCode: number;
    body: unknown;
  };
}

/** fakeReq нь method/cookie/толгойтой хамгийн бага Request. */
function fakeReq(opts: {
  method?: string;
  cookie?: string;
  headers?: Record<string, string>;
}): Request {
  const headers: Record<string, string> = {
    ...(opts.cookie === undefined ? {} : { cookie: opts.cookie }),
    ...opts.headers,
  };
  return {
    method: opts.method ?? 'POST',
    path: '/api/v1/users/me',
    ctx: {},
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

const originalEnv = AppConfig.ENVIRONMENT;
const originalSecure = AppConfig.COOKIE_SECURE;

afterEach(() => {
  AppConfig.ENVIRONMENT = originalEnv;
  AppConfig.COOKIE_SECURE = originalSecure;
});

describe('session cookie олгох', () => {
  it('access/refresh нь httpOnly, CSRF нь ЖС-д уншигдана', () => {
    const res = fakeRes();
    issueSessionCookies(res, 'at', 'rt');
    const cookies = res.cookies();
    expect(cookies).toHaveLength(3);

    const access = cookies.find((c) => c.startsWith(`${AccessCookie}=`)) ?? '';
    const refresh = cookies.find((c) => c.startsWith(`${RefreshCookie}=`)) ?? '';
    const csrf = cookies.find((c) => c.startsWith(`${CsrfCookie}=`)) ?? '';

    expect(access).toContain('HttpOnly');
    expect(refresh).toContain('HttpOnly');
    // CSRF нь double-submit-д ЖС-ээс уншигдах ёстой.
    expect(csrf).not.toContain('HttpOnly');
    expect(csrf).toMatch(new RegExp(`${CsrfCookie}=[0-9a-f]{32}`));
    for (const c of cookies) expect(c).toContain('SameSite=Lax');
  });

  it('production-д Secure флаг ҮРГЭЛЖ асна (fail-closed)', () => {
    AppConfig.ENVIRONMENT = 'production';
    AppConfig.COOKIE_SECURE = '';
    const res = fakeRes();
    issueSessionCookies(res, 'at', 'rt');
    for (const c of res.cookies()) expect(c).toContain('Secure');
  });

  it('зөвхөн ил COOKIE_SECURE=false үед Secure-гүй болно', () => {
    AppConfig.ENVIRONMENT = 'production';
    AppConfig.COOKIE_SECURE = 'false';
    const res = fakeRes();
    issueSessionCookies(res, 'at', 'rt');
    for (const c of res.cookies()) expect(c).not.toContain('Secure');
  });

  it('хоосон токен нь cookie үүсгэхгүй (CSRF нь үргэлж шинэчлэгдэнэ)', () => {
    const res = fakeRes();
    issueSessionCookies(res, '', '');
    const cookies = res.cookies();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain(CsrfCookie);
  });

  it('гарах үед бүх session cookie устгагдана', () => {
    const res = fakeRes();
    clearSessionCookies(res);
    const cookies = res.cookies();
    // access · refresh · csrf · SSO logout ref — ДӨРВҮҮЛЭН. SSO-гийн ref-ийг
    // орхивол дараагийн нэвтрэлтэд хуучин ref үлдэж, гарах урсгал буруу
    // session-ыг дуусгах оролдлого хийнэ.
    expect(cookies).toHaveLength(4);
    for (const name of [AccessCookie, RefreshCookie, CsrfCookie, SsoLogoutCookie]) {
      expect(cookies.some((c) => c.startsWith(`${name}=`))).toBe(true);
    }
    for (const c of cookies) expect(c).toContain('Max-Age=0');
  });
});

describe('CSRF double-submit', () => {
  const mw = csrfMiddleware();

  const run = (req: Request): { res: ReturnType<typeof fakeRes>; nexted: boolean } => {
    const res = fakeRes();
    const next = vi.fn();
    mw(req, res, next);
    return { res, nexted: next.mock.calls.length > 0 };
  };

  it('унших (GET) хүсэлт шалгалтгүй өнгөрнө', () => {
    const { nexted } = run(fakeReq({ method: 'GET', cookie: `${AccessCookie}=at` }));
    expect(nexted).toBe(true);
  });

  it('cookie-гоор баталгаажсан мутаци толгойгүй бол 403', () => {
    const { res, nexted } = run(
      fakeReq({ method: 'POST', cookie: `${AccessCookie}=at; ${CsrfCookie}=abc` }),
    );
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('буруу толгой нь 403', () => {
    const { res, nexted } = run(
      fakeReq({
        method: 'DELETE',
        cookie: `${AccessCookie}=at; ${CsrfCookie}=abc`,
        headers: { [CsrfHeader]: 'wrong' },
      }),
    );
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('таарсан толгой нь өнгөрнө', () => {
    const { nexted } = run(
      fakeReq({
        method: 'POST',
        cookie: `${AccessCookie}=at; ${CsrfCookie}=abc`,
        headers: { [CsrfHeader]: 'abc' },
      }),
    );
    expect(nexted).toBe(true);
  });

  it('CSRF cookie байхгүй бол (зөвхөн access) 403 — fail-closed', () => {
    const { res, nexted } = run(fakeReq({ method: 'POST', cookie: `${AccessCookie}=at` }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('Bearer токентой хүсэлт ХАМААРАХГҮЙ (ambient credential биш)', () => {
    const { nexted } = run(
      fakeReq({
        method: 'POST',
        cookie: `${AccessCookie}=at; ${CsrfCookie}=abc`,
        headers: { authorization: 'Bearer xyz' },
      }),
    );
    expect(nexted).toBe(true);
  });

  it('session cookie-гүй нээлттэй endpoint хамаарахгүй', () => {
    const { nexted } = run(fakeReq({ method: 'POST' }));
    expect(nexted).toBe(true);
  });
});
