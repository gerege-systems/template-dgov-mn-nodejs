// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// safeNext-ийн unit тест — open-redirect хамгаалалт. Зөвхөн ижил-origin
// харьцангуй зам (нэг '/'-оор эхэлсэн) зөвшөөрөгдөнө; protocol-relative ('//')
// болон backslash заль мэх татгалзаж '/' руу буцаана.
import { describe, it, expect } from 'vitest';
import { safeNext } from './navigation';

describe('safeNext', () => {
  it('allows a same-origin relative path', () => {
    expect(safeNext('/me/dashboard')).toBe('/me/dashboard');
    expect(safeNext('/admin/users?tab=1')).toBe('/admin/users?tab=1');
  });

  it('rejects protocol-relative open redirects', () => {
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('//evil.com/path')).toBe('/');
  });

  it('rejects backslash tricks', () => {
    expect(safeNext('/\\evil.com')).toBe('/');
  });

  it('rejects absolute URLs and non-slash input', () => {
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('evil.com')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
  });

  it('rejects non-string input', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext(42)).toBe('/');
    expect(safeNext({})).toBe('/');
  });
});
