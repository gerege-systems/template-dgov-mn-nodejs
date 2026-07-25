// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { deriveUpName, migrationNumber } from './migration.js';

describe('migrationNumber', () => {
  it('файлын нэрний эхний дугаарыг гаргана', () => {
    expect(migrationNumber('migrations/1_create_tables_users.up.sql')).toBe(1);
    expect(migrationNumber('migrations/10_users_name_en.up.sql')).toBe(10);
    expect(migrationNumber('44_gov_officer_rls.up.sql')).toBe(44);
  });

  it('дугааргүй файлыг хамгийн сүүлд эрэмбэлнэ', () => {
    expect(migrationNumber('migrations/no_number.up.sql')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('лексикографийн бус, ТООН эрэмбэ гаргана (10 нь 1-ээс хойно)', () => {
    // '0' < '_' тул лексикографаар "10_" нь "1_"-ээс өмнө ордог — энэ нь шинэ
    // хоосон DB дээр 10-р migration-ыг 1-ээс түрүүлж ажиллуулах алдаа болно.
    expect(migrationNumber('1_a.up.sql')).toBeLessThan(migrationNumber('10_b.up.sql'));
  });
});

describe('deriveUpName', () => {
  it('down файлын нэрийг up хосруу хөрвүүлнэ', () => {
    expect(deriveUpName('14_organizations.down.sql')).toBe('14_organizations.up.sql');
  });

  it('down бус нэрийг хөндөхгүй', () => {
    expect(deriveUpName('14_organizations.up.sql')).toBe('14_organizations.up.sql');
  });
});

describe('migrations каталог', () => {
  const dir = path.resolve('migrations');

  it('up дугаар бүрт down хос байна', () => {
    // Хосыг ДУГААРААР тааруулна, нэрээр биш: хамгийн эртний хоёр migration нь
    // up/down талд өөр нэр хэрэглэдэг (1_create_tables_users.up.sql ↔
    // 1_drop_tables_users.down.sql).
    const files = fs.readdirSync(dir);
    const ups = files.filter((f) => f.endsWith('.up.sql'));
    expect(ups.length).toBeGreaterThan(0);
    const downNumbers = new Set(
      files.filter((f) => f.endsWith('.down.sql')).map((f) => migrationNumber(f)),
    );
    const missing = ups.filter((up) => !downNumbers.has(migrationNumber(up)));
    expect(missing).toEqual([]);
  });

  it('нэг дугаарт хоёр өөр migration байхгүй', () => {
    const ups = fs.readdirSync(dir).filter((f) => f.endsWith('.up.sql'));
    const byNumber = new Map<number, string[]>();
    for (const up of ups) {
      const n = migrationNumber(up);
      byNumber.set(n, [...(byNumber.get(n) ?? []), up]);
    }
    // 17-р дугаарт хоёр файл байдаг нь ТҮҮХЭН БОДИТ (least_privilege_config_grants
    // + org_rls_recursion_fix) — тухайн үед зэрэг нэмэгдсэн. Тэрнээс бусад
    // давхардлыг алдаа гэж тооцно.
    const unexpected = [...byNumber.entries()].filter(([n, list]) => list.length > 1 && n !== 17);
    expect(unexpected).toEqual([]);
  });
});
