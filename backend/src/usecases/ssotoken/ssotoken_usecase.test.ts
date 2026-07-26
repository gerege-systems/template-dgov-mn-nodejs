// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// SSO токен үйлчилгээ + AES-GCM шифрлэгчийн unit тестүүд. Гол зорилго: хугацаа
// дуусах ДӨХСӨН токеныг урьдчилан refresh хийх, refresh_token-гүй нэвтрэлтийг
// хадгалахгүй байх, хадгалалт унасан ч дуудлагыг нэг удаа гүйцээх.

import { describe, expect, it, vi } from 'vitest';

import type { SSOTokenRepository } from '../../datasources/repositories/interface/ssotoken.js';
import { ErrSSOTokenNotFound, type SSOToken } from '../../domain/sso_token.js';
import { background } from '../../pkg/ctx/ctx.js';
import { Cipher } from '../../pkg/crypto/cipher.js';
import type { OIDCClient, Tokens } from '../../pkg/oidc/oidc.js';
import { newSSOTokenUsecase } from './ssotoken_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';

function tokens(over: Partial<Tokens> = {}): Tokens {
  return {
    accessToken: 'access-1',
    idToken: 'id-1',
    refreshToken: 'refresh-1',
    expiresIn: 3600,
    ...over,
  };
}

function build(stored: SSOToken | null, refreshed: Tokens = tokens({ accessToken: 'access-2' })) {
  const saved: SSOToken[] = [];
  const repo: SSOTokenRepository = {
    upsert: vi.fn((_ctx: unknown, _uid: string, tok: SSOToken) => {
      saved.push(tok);
      return Promise.resolve();
    }),
    get: vi.fn(() =>
      stored === null ? Promise.reject(new ErrSSOTokenNotFound()) : Promise.resolve(stored),
    ),
  };
  const refresh = vi.fn(() => Promise.resolve(refreshed));
  const oidc = { refresh } as unknown as OIDCClient;
  return { uc: newSSOTokenUsecase(repo, oidc), repo, refresh, saved };
}

describe('AES-256-GCM шифрлэгч', () => {
  it('round-trip ажиллана', () => {
    const c = new Cipher('key-1');
    const enc = c.encrypt('secret-value');
    expect(enc).not.toContain('secret-value');
    expect(c.decrypt(enc)).toBe('secret-value');
  });

  it('ӨӨР түлхүүрээр задлах оролдлого амжилтгүй (tag шалгагдана)', () => {
    const enc = new Cipher('key-1').encrypt('secret-value');
    expect(() => new Cipher('key-2').decrypt(enc)).toThrow();
  });

  it('хоосныг хоосноор үлдээнэ', () => {
    const c = new Cipher('key-1');
    expect(c.encrypt('')).toBe('');
    expect(c.decrypt('')).toBe('');
  });

  it('хэт богино шифр текстийг татгалзана', () => {
    expect(() => new Cipher('key-1').decrypt('c2hvcnQ=')).toThrow(/too short/);
  });
});

describe('store', () => {
  it('refresh_token-гүй нэвтрэлтийг ХАДГАЛАХГҮЙ (refresh боломжгүй)', async () => {
    const { uc, repo } = build(null);
    await uc.store(background(), userId, tokens({ refreshToken: '' }));
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('expires_in тэг бол даруй дуусах хугацаатай хадгална', async () => {
    const { uc, saved } = build(null);
    await uc.store(background(), userId, tokens({ expiresIn: 0 }));
    expect(saved[0]!.accessExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('validAccessToken', () => {
  it('хүчинтэй токеныг refresh ХИЙЛГҮЙ буцаана', async () => {
    const { uc, refresh } = build({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      accessExpiresAt: new Date(Date.now() + 10 * 60_000),
    });
    await expect(uc.validAccessToken(background(), userId)).resolves.toBe('access-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('хугацаа дуусах ДӨХСӨН (60с-ээс бага) бол урьдчилан refresh хийнэ', async () => {
    const { uc, refresh, saved } = build({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      accessExpiresAt: new Date(Date.now() + 30_000),
    });
    await expect(uc.validAccessToken(background(), userId)).resolves.toBe('access-2');
    expect(refresh).toHaveBeenCalledWith('refresh-1', undefined);
    expect(saved[0]?.accessToken).toBe('access-2');
  });

  it('хадгалагдсан токен байхгүй бол ErrSSOTokenNotFound ДАМЖИНА', async () => {
    const { uc } = build(null);
    await expect(uc.validAccessToken(background(), userId)).rejects.toBeInstanceOf(
      ErrSSOTokenNotFound,
    );
  });

  it('хадгалалт унасан ч шинэ токеныг буцаана (дуудлага нэг удаа гүйцэднэ)', async () => {
    const repo: SSOTokenRepository = {
      upsert: vi.fn(() => Promise.reject(new Error('db down'))),
      get: vi.fn(() =>
        Promise.resolve({
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          accessExpiresAt: new Date(Date.now() - 1000),
        }),
      ),
    };
    const oidc = {
      refresh: vi.fn(() => Promise.resolve(tokens({ accessToken: 'access-9' }))),
    } as unknown as OIDCClient;

    await expect(
      newSSOTokenUsecase(repo, oidc).validAccessToken(background(), userId),
    ).resolves.toBe('access-9');
  });
});
