// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { afterEach, describe, expect, it } from 'vitest';

import {
  AppConfig,
  allowedOriginsList,
  initializeAppConfig,
  issuer,
  parseDotEnv,
  providerConfigured,
  sslModeOf,
} from './config.js';

/** validEnv нь шалгалтуудыг давдаг хамгийн бага багц. */
function validEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    PORT: '8080',
    ENVIRONMENT: 'development',
    JWT_SECRET: 'x'.repeat(40),
    JWT_EXPIRED: '5',
    JWT_ISSUER: 'test.dgov.mn',
    REDIS_HOST: 'redis:6379',
    REDIS_PASS: 'pass',
    REDIS_EXPIRED: '5',
    DB_POSTGRE_DRIVER: 'postgres',
    DB_POSTGRE_DSN: 'postgres://u:p@db:5432/d?sslmode=disable',
    ...overrides,
  };
}

const originalEnv = { ...process.env };

function withEnv(env: Record<string, string>): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
}

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

describe('config', () => {
  it('зөв багцыг ачаалж default-уудыг тавина', () => {
    withEnv(validEnv());
    initializeAppConfig();
    expect(AppConfig.PORT).toBe(8080);
    expect(AppConfig.BCRYPT_COST).toBe(12);
    expect(AppConfig.JWT_REFRESH_EXPIRED).toBe(7);
    expect(AppConfig.DB_MAX_OPEN_CONNS).toBe(25);
    expect(AppConfig.DB_MAX_IDLE_CONNS).toBe(5);
    expect(AppConfig.OTP_MAX_ATTEMPTS).toBe(5);
    expect(AppConfig.EID_BASE_URL).toBe('https://eidmongolia.mn/v3');
    // Тодорхой унтраагаагүй бол relay demo simulator идэвхтэй.
    expect(AppConfig.RELAY_DEMO_MODE).toBe(true);
  });

  it('RELAY_DEMO_MODE-г ил false болгож унтраана', () => {
    withEnv(validEnv({ RELAY_DEMO_MODE: 'false' }));
    initializeAppConfig();
    expect(AppConfig.RELAY_DEMO_MODE).toBe(false);
  });

  it('дутуу шаардлагатай хувьсагч дээр унана', () => {
    const env = validEnv();
    delete env.JWT_SECRET;
    withEnv(env);
    expect(() => initializeAppConfig()).toThrow();
  });

  it('32 тэмдэгтээс богино JWT_SECRET-ийг татгалзана', () => {
    withEnv(validEnv({ JWT_SECRET: 'short' }));
    expect(() => initializeAppConfig()).toThrow(/at least 32 characters/);
  });

  it('JWT_EXPIRED-ийн 24 цагийн дээд хязгаарыг хүчинтэй болгоно', () => {
    withEnv(validEnv({ JWT_EXPIRED: '48' }));
    expect(() => initializeAppConfig()).toThrow(/between 1 and 24 hours/);
  });

  it('танихгүй ENVIRONMENT-ийг татгалзана', () => {
    withEnv(validEnv({ ENVIRONMENT: 'staging' }));
    expect(() => initializeAppConfig()).toThrow(/must be 'development' or 'production'/);
  });

  it('production-д баталгаажсан TLS-гүй DB URL-ийг татгалзана', () => {
    withEnv(
      validEnv({
        ENVIRONMENT: 'production',
        DB_POSTGRE_URL: 'postgres://u:p@db:5432/d?sslmode=require',
        ALLOWED_ORIGINS: 'https://node.template.dgov.mn',
        VERIFY_API_KEY: 'k',
      }),
    );
    expect(() => initializeAppConfig()).toThrow(/sslmode=verify-full/);
  });

  it('production-д verify-full-г зөвшөөрнө', () => {
    withEnv(
      validEnv({
        ENVIRONMENT: 'production',
        DB_POSTGRE_URL: 'postgres://u:p@db:5432/d?sslmode=verify-full',
        ALLOWED_ORIGINS: 'https://node.template.dgov.mn',
        VERIFY_API_KEY: 'k',
      }),
    );
    expect(() => initializeAppConfig()).not.toThrow();
  });

  it('production-д ALLOWED_ORIGINS болон VERIFY_API_KEY-г шаардана', () => {
    withEnv(
      validEnv({
        ENVIRONMENT: 'production',
        DB_POSTGRE_URL: 'postgres://u:p@db:5432/d?sslmode=verify-full',
        VERIFY_API_KEY: 'k',
      }),
    );
    expect(() => initializeAppConfig()).toThrow(/ALLOWED_ORIGINS/);
  });
});

describe('sslModeOf', () => {
  it('URL хэлбэрээс sslmode-г гаргана', () => {
    expect(sslModeOf('postgres://u:p@h:5432/d?sslmode=verify-full')).toBe('verify-full');
  });

  it('keyword/DSN хэлбэрээс sslmode-г гаргана', () => {
    expect(sslModeOf('host=h port=5432 user=u sslmode=Verify-CA')).toBe('verify-ca');
  });

  it('sslmode байхгүй бол хоосон буцаана (найдваргүйд тооцно)', () => {
    expect(sslModeOf('postgres://u:p@h:5432/d')).toBe('');
    expect(sslModeOf('host=h port=5432')).toBe('');
  });
});

describe('allowedOriginsList', () => {
  it('development-д хоосон бол wildcard', () => {
    withEnv(validEnv());
    initializeAppConfig();
    expect(allowedOriginsList()).toEqual(['*']);
  });

  it('CSV-г тайрч задална', () => {
    withEnv(validEnv({ ALLOWED_ORIGINS: 'https://a.mn , https://b.mn ,' }));
    initializeAppConfig();
    expect(allowedOriginsList()).toEqual(['https://a.mn', 'https://b.mn']);
  });
});

describe('issuer', () => {
  it('сүүлийн slash-ыг хасна (id_token-ий iss-тэй яг таарах ёстой)', () => {
    withEnv(validEnv({ OAUTH_ISSUER: 'https://node.template.dgov.mn/' }));
    initializeAppConfig();
    expect(issuer()).toBe('https://node.template.dgov.mn');
  });

  it('providerConfigured нь 32 байтаас богино state key-г татгалзана', () => {
    withEnv(validEnv({ OAUTH_ISSUER: 'https://x.mn', SSO_STATE_KEY: 'short' }));
    initializeAppConfig();
    expect(providerConfigured()).toBe(false);
  });

  it('providerConfigured нь issuer + урт state key-тэй үед true', () => {
    withEnv(validEnv({ OAUTH_ISSUER: 'https://x.mn', SSO_STATE_KEY: 'k'.repeat(48) }));
    initializeAppConfig();
    expect(providerConfigured()).toBe(true);
  });
});

describe('parseDotEnv', () => {
  it('тайлбар, хоосон мөр, export угтвар, хашилтыг зохицуулна', () => {
    const parsed = parseDotEnv(
      ['# comment', '', 'A=1', 'export B=two', 'C="quoted value"', "D='single'", 'BAD_LINE'].join(
        '\n',
      ),
    );
    expect(parsed).toEqual({ A: '1', B: 'two', C: 'quoted value', D: 'single' });
  });

  it('утга дотор буй = тэмдгийг хадгална', () => {
    expect(parseDotEnv('DSN=postgres://u:p@h/d?a=b&c=d')).toEqual({
      DSN: 'postgres://u:p@h/d?a=b&c=d',
    });
  });
});
