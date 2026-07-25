// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// BFF хамгаалалтын unit тест: checkOrigin (double-submit CSRF header + Origin
// тулгалт), checkUUID / checkIntID route-param валидаци. Эдгээр нь bcs mutating
// BFF route бүрийн эхний хаалга тул регрессээс хамгаална.
import { describe, it, expect, afterEach } from 'vitest';
import { checkOrigin, checkUUID, checkIntID } from './bff';

function req(url: string, headers: Record<string, string>): Request {
  return new Request(url, { method: 'POST', headers });
}

afterEach(() => {
  delete process.env.APP_ORIGIN;
});

describe('checkOrigin', () => {
  it('rejects when the CSRF header is missing → 403', () => {
    const res = checkOrigin(req('https://app.mn/api/x', {}));
    expect(res?.status).toBe(403);
  });

  it('passes when CSRF header present and no Origin (non-browser)', () => {
    const res = checkOrigin(req('https://app.mn/api/x', { 'x-dgov-csrf': '1' }));
    expect(res).toBeNull();
  });

  it('passes when Origin matches APP_ORIGIN', () => {
    process.env.APP_ORIGIN = 'https://template.dgov.mn';
    const res = checkOrigin(
      req('https://template.dgov.mn/api/x', {
        'x-dgov-csrf': '1',
        origin: 'https://template.dgov.mn',
      }),
    );
    expect(res).toBeNull();
  });

  it('rejects a mismatched Origin → 403', () => {
    process.env.APP_ORIGIN = 'https://template.dgov.mn';
    const res = checkOrigin(
      req('https://template.dgov.mn/api/x', {
        'x-dgov-csrf': '1',
        origin: 'https://evil.example',
      }),
    );
    expect(res?.status).toBe(403);
  });

  it('falls back to request origin when APP_ORIGIN unset', () => {
    const res = checkOrigin(
      req('https://self.mn/api/x', { 'x-dgov-csrf': '1', origin: 'https://self.mn' }),
    );
    expect(res).toBeNull();
  });
});

describe('checkUUID', () => {
  it('accepts a valid UUID', () => {
    expect(checkUUID('c4f371c3-20bd-462e-8d97-5bc4a20fde08')).toBeNull();
  });
  it('rejects a non-UUID → 400', () => {
    expect(checkUUID('not-a-uuid')?.status).toBe(400);
    expect(checkUUID('1; DROP TABLE users')?.status).toBe(400);
  });
});

describe('checkIntID', () => {
  it('accepts a small integer', () => {
    expect(checkIntID('42')).toBeNull();
  });
  it('rejects non-integer / overflow-ish input → 400', () => {
    expect(checkIntID('abc')?.status).toBe(400);
    expect(checkIntID('99999999999')?.status).toBe(400);
    expect(checkIntID('-1')?.status).toBe(400);
  });
});
