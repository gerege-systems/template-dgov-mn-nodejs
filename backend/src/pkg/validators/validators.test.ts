// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ValidationErrors,
  email,
  nonEmpty,
  strictObject,
  strongPassword,
  validatePayloads,
} from './validators.js';

const registerSchema = strictObject({
  username: nonEmpty(50),
  email: email(),
  password: strongPassword(8, 72),
});

describe('validatePayloads', () => {
  it('зөв payload-ийг задлан уншиж буцаана', () => {
    const out = validatePayloads(registerSchema, {
      username: 'batbayar',
      email: 'bat@dgov.mn',
      password: 'Str0ng!Pass',
    });
    expect(out.username).toBe('batbayar');
  });

  it('дутуу талбарыг "required" tag-аар мэдээлнэ', () => {
    try {
      validatePayloads(registerSchema, { email: 'bat@dgov.mn', password: 'Str0ng!Pass' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationErrors);
      const ve = err as ValidationErrors;
      expect(ve.errors).toHaveLength(1);
      expect(ve.errors[0]).toEqual({
        field: 'username',
        tag: 'required',
        message: 'is a required field',
      });
    }
  });

  it('буруу и-мэйлийг "email" tag-аар мэдээлнэ', () => {
    try {
      validatePayloads(registerSchema, {
        username: 'bat',
        email: 'not-an-email',
        password: 'Str0ng!Pass',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const ve = err as ValidationErrors;
      expect(ve.errors[0]?.tag).toBe('email');
      expect(ve.errors[0]?.message).toBe('is not a valid email address');
    }
  });

  it('сул нууц үгийг "strongpassword" tag-аар мэдээлнэ', () => {
    try {
      validatePayloads(registerSchema, {
        username: 'bat',
        email: 'bat@dgov.mn',
        password: 'alllowercase',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const ve = err as ValidationErrors;
      expect(ve.errors[0]?.tag).toBe('strongpassword');
      expect(ve.errors[0]?.message).toContain('uppercase, lowercase, digit');
    }
  });

  it('хэт богино утгыг "min" tag + тэмдэгтийн тоогоор мэдээлнэ', () => {
    try {
      validatePayloads(registerSchema, {
        username: 'bat',
        email: 'bat@dgov.mn',
        password: 'Ab1!',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const ve = err as ValidationErrors;
      expect(ve.errors[0]?.tag).toBe('min');
      expect(ve.errors[0]?.message).toBe('must be at least 8 characters long');
    }
  });

  it('танихгүй талбарыг татгалзана (DisallowUnknownFields-тай нийцтэй)', () => {
    try {
      validatePayloads(registerSchema, {
        username: 'bat',
        email: 'bat@dgov.mn',
        password: 'Str0ng!Pass',
        role_id: 1,
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const ve = err as ValidationErrors;
      expect(ve.errors[0]?.tag).toBe('unknown_field');
    }
  });

  it('бүтэлгүй болсон талбар бүрт нэг бичлэг гаргана', () => {
    try {
      validatePayloads(registerSchema, { email: 'nope', password: 'weak' });
      expect.unreachable('should have thrown');
    } catch (err) {
      const ve = err as ValidationErrors;
      expect(ve.errors.length).toBeGreaterThanOrEqual(3);
      expect(ve.message).toContain('username');
    }
  });

  it('үүрлэсэн талбарын замыг цэгээр нэгтгэнэ', () => {
    const schema = strictObject({ profile: strictObject({ email: email() }) });
    try {
      validatePayloads(schema, { profile: { email: 'bad' } });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ValidationErrors).errors[0]?.field).toBe('profile.email');
    }
  });

  it('zod-ийн бусад дүрмийн мессежийг хэвээр дамжуулна', () => {
    const schema = strictObject({ n: z.number().int() });
    try {
      validatePayloads(schema, { n: 1.5 });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ValidationErrors).errors[0]?.field).toBe('n');
    }
  });
});
