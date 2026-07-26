// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import jsonwebtoken from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import {
  ErrInvalidToken,
  ErrWrongTokenKind,
  KindAccess,
  KindRefresh,
  newJWTServiceWithRefresh,
  type Clock,
} from './jwt.js';

const secret = 'test-secret-that-is-at-least-32-characters-long';
const issuer = 'test.dgov.mn';

const frozen = (iso: string): Clock => ({ now: () => new Date(iso) });

describe('jwt', () => {
  it('access токеныг үүсгэж эргүүлж уншина', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 2, 7);
    const token = svc.generateToken('user-1', true, 2, 'a@b.mn');
    const claims = svc.parseToken(token);
    expect(claims.UserID).toBe('user-1');
    expect(claims.IsAdmin).toBe(true);
    expect(claims.RoleID).toBe(2);
    expect(claims.Email).toBe('a@b.mn');
    expect(claims.Kind).toBe(KindAccess);
    expect(claims.iss).toBe(issuer);
    expect(claims.jti).not.toBe('');
  });

  it('хос токен нь өөр jti болон өөр kind-тай', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 2, 7);
    const pair = svc.generateTokenPair('user-1', false, 4, 'a@b.mn');
    expect(pair.accessJTI).not.toBe(pair.refreshJTI);
    expect(svc.parseToken(pair.access_token).Kind).toBe(KindAccess);
    expect(svc.parseRefreshToken(pair.refresh_token).Kind).toBe(KindRefresh);
  });

  it('refresh токеныг access мэтээр уншихыг татгалзана (мөн эсрэгээр)', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 2, 7);
    const pair = svc.generateTokenPair('user-1', false, 4, 'a@b.mn');
    expect(() => svc.parseToken(pair.refresh_token)).toThrow(ErrWrongTokenKind);
    expect(() => svc.parseRefreshToken(pair.access_token)).toThrow(ErrWrongTokenKind);
  });

  it('өөр secret-ээр гарын үсэг зурсан токеныг татгалзана', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 2, 7);
    const other = newJWTServiceWithRefresh(`${secret}-other`, issuer, 2, 7);
    const token = other.generateToken('user-1', false, 4, 'a@b.mn');
    expect(() => svc.parseToken(token)).toThrow(ErrInvalidToken);
  });

  it('өөр issuer-ийн токеныг татгалзана (cross-accept-аас хамгаална)', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 2, 7);
    const other = newJWTServiceWithRefresh(secret, 'evil.example', 2, 7);
    const token = other.generateToken('user-1', false, 4, 'a@b.mn');
    expect(() => svc.parseToken(token)).toThrow(ErrInvalidToken);
  });

  it('alg=none (алгоритм хутгах) халдлагыг татгалзана', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 2, 7);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ UserID: 'x', iss: issuer, exp: 9999999999 }),
    ).toString('base64url');
    expect(() => svc.parseToken(`${header}.${payload}.`)).toThrow(ErrInvalidToken);
  });

  it('exp claim-гүй токеныг татгалзана', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 2, 7);
    const token = jsonwebtoken.sign({ UserID: 'x', Kind: KindAccess, iss: issuer }, secret, {
      algorithm: 'HS256',
      noTimestamp: true,
    });
    expect(() => svc.parseToken(token)).toThrow(ErrInvalidToken);
  });

  it('хугацаа дууссан токеныг татгалзана', () => {
    const svc = newJWTServiceWithRefresh(secret, issuer, 1, 7).withClock(
      frozen('2020-01-01T00:00:00Z'),
    );
    const token = svc.generateToken('user-1', false, 4, 'a@b.mn');
    // Одоо (2026) уншихад 2020-д олгогдсон 1 цагийн токен хүчингүй.
    expect(() => newJWTServiceWithRefresh(secret, issuer, 1, 7).parseToken(token)).toThrow(
      ErrInvalidToken,
    );
  });

  it('царцаасан цаг нь яг таг exp/iat утга гаргана', () => {
    const at = '2026-07-25T10:00:00.000Z';
    const svc = newJWTServiceWithRefresh(secret, issuer, 3, 10).withClock(frozen(at));
    const pair = svc.generateTokenPair('user-1', false, 4, 'a@b.mn');
    const base = Math.floor(new Date(at).getTime() / 1000);
    expect(pair.access_expires_at.getTime()).toBe(new Date(at).getTime() + 3 * 3_600_000);
    expect(pair.refresh_expires_at.getTime()).toBe(new Date(at).getTime() + 10 * 86_400_000);
    // Хугацаа хэтэрсэн тул parse хийхгүй — payload-г шууд decode хийж шалгана.
    const decoded = jsonwebtoken.decode(pair.access_token) as { iat: number; exp: number };
    expect(decoded.iat).toBe(base);
    expect(decoded.exp).toBe(base + 3 * 3600);
  });
});
