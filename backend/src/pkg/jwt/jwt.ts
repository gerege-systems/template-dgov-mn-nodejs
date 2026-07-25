// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { randomUUID } from 'node:crypto';

import jsonwebtoken, { type JwtPayload } from 'jsonwebtoken';

import * as logger from '../logger/logger.js';

/** ErrInvalidToken нь токен задлан унших эсвэл баталгаажуулахад амжилтгүй болоход. */
export class ErrInvalidToken extends Error {
  constructor(detail?: string) {
    super(detail ? `token is not valid: ${detail}` : 'token is not valid');
    this.name = 'ErrInvalidToken';
  }
}

/**
 * ErrWrongTokenKind нь дуудагч access токеныг refresh токен мэтээр (эсвэл
 * эсрэгээр) задлан уншихыг оролдоход буцаагдана.
 */
export class ErrWrongTokenKind extends Error {
  constructor() {
    super('token kind mismatch');
    this.name = 'ErrWrongTokenKind';
  }
}

/**
 * Kind-ууд нь access болон refresh токеныг ялгана. Claim дотор гарын үсэг
 * зурагдсан тул эвдэрсэн refresh токеныг access токен болгон дахин ашиглах
 * боломжгүй.
 */
export const KindAccess = 'access';
export const KindRefresh = 'refresh';

/**
 * TokenPair нь login / refresh үед хамт олгогддог богино настай access токен
 * болон урт настай refresh токеныг багцална.
 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  access_expires_at: Date;
  refresh_expires_at: Date;
  /** JSON-д гардаггүй (Go хувилбарын `json:"-"` талбарууд). */
  accessJTI: string;
  refreshJTI: string;
}

/** JwtCustomClaim нь энэ апп-ын гарын үсэг зурдаг claim-ийн бүрэн бүтэц. */
export interface JwtCustomClaim {
  UserID: string;
  IsAdmin: boolean;
  RoleID: number;
  Email: string;
  Kind: string;
  /** RegisteredClaims — jti / exp / iss / iat. */
  jti: string;
  exp: number;
  iss: string;
  iat: number;
}

/** Clock нь "одоо"-гийн эх сурвалж — тестүүд цагийг царцуулахад орлуулна. */
export interface Clock {
  now(): Date;
}

export const RealClock: Clock = { now: () => new Date() };

export interface JWTService {
  /**
   * generateToken нь нэг access токен үүсгэнэ. Дуудагчид зэрэгцээ refresh токен
   * хэрэгтэй бол generateTokenPair-г илүүд үзнэ.
   */
  generateToken(userId: string, isAdmin: boolean, roleId: number, email: string): string;
  /**
   * generateTokenPair нь access+refresh хосыг үүсгэнэ, хоёулаа ижил secret-ээр
   * гарын үсэг зурагдсан боловч Kind claim-ээр ялгагдана.
   */
  generateTokenPair(userId: string, isAdmin: boolean, roleId: number, email: string): TokenPair;
  /**
   * parseToken нь access токены гарын үсэг, хүчинтэй хугацаа болон HMAC аргыг
   * шалгана. Refresh токеныг ErrWrongTokenKind-ээр татгалзана.
   */
  parseToken(token: string): JwtCustomClaim;
  /** parseRefreshToken нь parseToken-ийн refresh токены эквивалент юм. */
  parseRefreshToken(token: string): JwtCustomClaim;
  /** withClock нь өгөгдсөн clock-оор орлуулсан сервисийн хуулбарыг буцаана. */
  withClock(c: Clock): JWTService;
}

class JwtServiceImpl implements JWTService {
  constructor(
    private readonly secretKey: string,
    private readonly issuer: string,
    /** цаг */
    private readonly expired: number,
    /** өдөр */
    private readonly refreshExpired: number,
    private readonly clock: Clock = RealClock,
  ) {}

  withClock(c: Clock): JWTService {
    return new JwtServiceImpl(this.secretKey, this.issuer, this.expired, this.refreshExpired, c);
  }

  generateToken(userId: string, isAdmin: boolean, roleId: number, email: string): string {
    return this.signAccess(userId, isAdmin, roleId, email).token;
  }

  generateTokenPair(userId: string, isAdmin: boolean, roleId: number, email: string): TokenPair {
    const access = this.signAccess(userId, isAdmin, roleId, email);
    const refresh = this.signRefresh(userId, email);
    return {
      access_token: access.token,
      refresh_token: refresh.token,
      access_expires_at: access.expiresAt,
      refresh_expires_at: refresh.expiresAt,
      accessJTI: access.jti,
      refreshJTI: refresh.jti,
    };
  }

  private signAccess(
    userId: string,
    isAdmin: boolean,
    roleId: number,
    email: string,
  ): { token: string; expiresAt: Date; jti: string } {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.expired * 3_600_000);
    const jti = randomUUID();
    const token = this.sign({
      UserID: userId,
      IsAdmin: isAdmin,
      RoleID: roleId,
      Email: email,
      Kind: KindAccess,
      jti,
      iss: this.issuer,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    return { token, expiresAt, jti };
  }

  private signRefresh(
    userId: string,
    email: string,
  ): { token: string; expiresAt: Date; jti: string } {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.refreshExpired * 86_400_000);
    const jti = randomUUID();
    const token = this.sign({
      UserID: userId,
      IsAdmin: false,
      RoleID: 0,
      Email: email,
      Kind: KindRefresh,
      jti,
      iss: this.issuer,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    return { token, expiresAt, jti };
  }

  private sign(claims: JwtCustomClaim): string {
    try {
      // Claim-уудыг ГАРААР бүтээсэн (exp/iat/iss/jti аль хэдийн байгаа) тул
      // jsonwebtoken-ий автомат нэмэлтийг ашиглахгүй — Go хувилбартай яг ижил
      // payload гарна. `noTimestamp` тавьж БОЛОХГҮЙ: тэр нь payload-оос iat-ийг
      // УСТГАДАГ бөгөөд auth middleware нь нууц үг солих тасалбарыг iat-ээр
      // шалгадаг тул токен хүчингүй болгох механизм нь чимээгүй эвдэрнэ.
      // (noTimestamp-гүй үед jsonwebtoken нь payload дахь iat-ийг хүндэтгэдэг.)
      return jsonwebtoken.sign(claims, this.secretKey, { algorithm: 'HS256' });
    } catch (err) {
      logger.error('jwt: sign failed', {
        package: 'jwt',
        step: 'signed_string',
        kind: claims.Kind,
        error: logger.errText(err),
      });
      throw new Error(`sign jwt: ${logger.errText(err)}`);
    }
  }

  parseToken(token: string): JwtCustomClaim {
    const claims = this.parse(token);
    // Хоосон Kind-г access токен гэж хүлээн авна; зөвхөн илэрхий access биш
    // утгыг (жишээ нь KindRefresh) энд татгалзана.
    if (claims.Kind !== '' && claims.Kind !== KindAccess) throw new ErrWrongTokenKind();
    return claims;
  }

  parseRefreshToken(token: string): JwtCustomClaim {
    const claims = this.parse(token);
    if (claims.Kind !== KindRefresh) throw new ErrWrongTokenKind();
    return claims;
  }

  private parse(token: string): JwtCustomClaim {
    let decoded: JwtPayload;
    try {
      decoded = jsonwebtoken.verify(token, this.secretKey, {
        // alg-confusion-аас хамгаална: зөвхөн HS256-г хүлээн авна.
        algorithms: ['HS256'],
        // Ижил secret-тэй өөр сервисийн токеныг cross-accept хийхээс сэргийлнэ.
        issuer: this.issuer,
        // exp-гүй токеныг хүчингүй болгоно.
        clockTolerance: 0,
      }) as JwtPayload;
    } catch (err) {
      logger.warn('jwt: parse failed', {
        package: 'jwt',
        step: 'verify',
        error: logger.errText(err),
      });
      throw new ErrInvalidToken(logger.errText(err));
    }

    if (typeof decoded !== 'object' || decoded === null) {
      logger.warn('jwt: token reported invalid by parser', {
        package: 'jwt',
        step: 'validity_check',
      });
      throw new ErrInvalidToken();
    }
    // jsonwebtoken нь exp байхгүй токеныг хүчинтэйд тооцдог тул ил шалгана
    // (Go-ийн WithExpirationRequired-ийн эквивалент).
    if (typeof decoded.exp !== 'number') {
      logger.warn('jwt: token has no exp claim', { package: 'jwt', step: 'exp_required' });
      throw new ErrInvalidToken('exp claim is required');
    }

    return {
      UserID: typeof decoded.UserID === 'string' ? decoded.UserID : '',
      IsAdmin: decoded.IsAdmin === true,
      RoleID: typeof decoded.RoleID === 'number' ? decoded.RoleID : 0,
      Email: typeof decoded.Email === 'string' ? decoded.Email : '',
      Kind: typeof decoded.Kind === 'string' ? decoded.Kind : '',
      jti: typeof decoded.jti === 'string' ? decoded.jti : '',
      exp: decoded.exp,
      iss: typeof decoded.iss === 'string' ? decoded.iss : '',
      iat: typeof decoded.iat === 'number' ? decoded.iat : 0,
    };
  }
}

export function newJWTService(secretKey: string, issuer: string, expiredHours: number): JWTService {
  return new JwtServiceImpl(secretKey, issuer, expiredHours, 7);
}

/**
 * newJWTServiceWithRefresh нь тус тусдаа тохируулж болох настай access + refresh
 * токены хосыг үүсгэдэг сервис байгуулна.
 */
export function newJWTServiceWithRefresh(
  secretKey: string,
  issuer: string,
  expiredHours: number,
  refreshExpiredDays: number,
): JWTService {
  return new JwtServiceImpl(secretKey, issuer, expiredHours, refreshExpiredDays);
}
