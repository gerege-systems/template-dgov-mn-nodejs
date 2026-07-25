// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { describe, expect, it } from 'vitest';

import {
  asDomainError,
  conflict,
  DomainError,
  ErrorType,
  internalCause,
  is,
  isNotFound,
  notFound,
  wrap,
} from './index.js';

describe('apperror', () => {
  it('төрөлжсөн constructor-ууд зөв төрөл тавина', () => {
    expect(notFound('x').type).toBe(ErrorType.NotFound);
    expect(conflict('x').type).toBe(ErrorType.Conflict);
  });

  it('is нь боосон алдааны гинжийг уруудаж төрлийг олно', () => {
    const inner = notFound('user not found');
    const outer = new Error('repository failed', { cause: inner });
    expect(is(outer, ErrorType.NotFound)).toBe(true);
    expect(isNotFound(outer)).toBe(true);
    expect(is(outer, ErrorType.Conflict)).toBe(false);
  });

  it('wrap нь мессежийг хадгалж cause-ийг хавсаргана', () => {
    const base = notFound('user not found');
    const cause = new Error('sql: no rows in result set');
    const wrapped = wrap(base, cause);
    expect(wrapped?.message).toBe('user not found');
    expect(wrapped?.type).toBe(ErrorType.NotFound);
    expect(wrapped?.cause).toBe(cause);
    // Оролтыг өөрчлөхгүй.
    expect(base.cause).toBeUndefined();
  });

  it('internalCause нь cause-ийг нуухын зэрэгцээ ерөнхий мессеж үзүүлнэ', () => {
    const cause = new Error('pq: connection refused to 10.0.0.5:5432');
    const err = internalCause(cause);
    expect(err.message).toBe('internal server error');
    expect(err.type).toBe(ErrorType.Internal);
    expect(err.cause).toBe(cause);
  });

  it('asDomainError нь DomainError биш алдаанд null буцаана', () => {
    expect(asDomainError(new Error('plain'))).toBeNull();
    expect(asDomainError(undefined)).toBeNull();
  });

  it('гинж хэт гүн байвал хязгаарлагдана (хязгааргүй цикл болохгүй)', () => {
    const self: { cause?: unknown } = {};
    self.cause = self;
    expect(asDomainError(self)).toBeNull();
  });

  it('DomainError нь Error-ээс удамшина', () => {
    const err = new DomainError(ErrorType.BadRequest, 'bad');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DomainError');
  });
});
