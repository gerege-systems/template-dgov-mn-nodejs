/**
 * Migration-ий дугаарлалтын хамгаалалт — DB шаардлагагүй.
 *
 * Юуг хамгаалж байна вэ: runner нь файлуудыг эхний дугаараар эрэмбэлж
 * ажиллуулдаг тул нэг дугаарыг хоёр файл эзэмбэл эрэмбэ нь файлын нэрээр
 * санамсаргүй шийдэгддэг. Мөн суурь (core) болон апп өөрийн migration-ууд
 * нэг мужид орвол repo хооронд merge хийхэд эрэмбэ будлиантана.
 *
 * Дүрмийг migrations/README.md-д тайлбарлав. Муж нь migrations/RANGE-д,
 * конвенцоос өмнөх хуучин файлууд migrations/LEGACY-д байрлана.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { migrationNumber } from './migration.js';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

/** Тайлбар (#) болон хоосон мөрийг алгасаж мөрүүдийг уншина. */
function readLines(file: string): string[] {
  return fs
    .readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

function readRange(): [number, number] {
  const lines = readLines('RANGE');
  expect(lines, 'RANGE файлд яг нэг утгын мөр байх ёстой').toHaveLength(1);
  const parts = (lines[0] ?? '').split(/\s+/);
  expect(parts, 'RANGE формат нь "эхлэл төгсгөл"').toHaveLength(2);
  const lo = Number.parseInt(parts[0] ?? '', 10);
  const hi = Number.parseInt(parts[1] ?? '', 10);
  expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
  expect(lo).toBeLessThanOrEqual(hi);
  return [lo, hi];
}

function upFiles(): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.up.sql'));
  expect(files.length, 'migrations хавтас хоосон — зам буруу байж болзошгүй').toBeGreaterThan(0);
  return files.sort();
}

const legacy = new Set(readLines('LEGACY'));

describe('migration дугаарлалт', () => {
  it('шинэ migration дугаараа хуваалцахгүй', () => {
    const byNum = new Map<number, string[]>();
    for (const name of upFiles()) {
      const n = migrationNumber(name);
      byNum.set(n, [...(byNum.get(n) ?? []), name]);
    }
    const clashes: string[] = [];
    for (const [num, names] of byNum) {
      if (names.length < 2) continue;
      // Бүгд хуучин бол production-д хэрэгжсэн тул хэвээр үлдээнэ.
      if (names.every((n) => legacy.has(n))) continue;
      clashes.push(`${num}: ${names.sort().join(', ')}`);
    }
    expect(clashes, 'нэг дугаарыг олон файл эзэмшиж байна — сул дугаар өг').toEqual([]);
  });

  it('шинэ migration нь энэ репогийн мужид багтана', () => {
    const [lo, hi] = readRange();
    const outside = upFiles()
      .filter((n) => !legacy.has(n))
      .filter((n) => migrationNumber(n) < lo || migrationNumber(n) > hi);
    expect(outside, `муж [${lo}..${hi}]-аас гадуур (migrations/README.md)`).toEqual([]);
  });

  it('шинэ up бүрд down хос байна', () => {
    const missing = upFiles()
      .filter((n) => !legacy.has(n))
      .filter(
        (n) => !fs.existsSync(path.join(MIGRATIONS_DIR, n.replace(/\.up\.sql$/, '.down.sql'))),
      );
    expect(missing, 'down хос алга').toEqual([]);
  });

  it('LEGACY нь бодит файлуудыг заана', () => {
    const present = new Set(upFiles());
    const stale = [...legacy].filter((n) => !present.has(n));
    expect(stale, 'LEGACY дахь файл байхгүй — мөрийг устга').toEqual([]);
  });
});
