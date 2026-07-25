// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Relay домэйний цэвэр дүрмүүдийн тестүүд — webhook-ийн HMAC гарын үсэг
// (m2m итгэлийн цорын ганц үндэс) болон SLA сануулгын босгууд.

import { describe, expect, it } from 'vitest';

import {
  relayIsDemoEndpoint,
  relayNewWebhookSecret,
  relayRemindersDue,
  relaySignWebhook,
  relayVerifyWebhook,
} from './relay.js';

const body = Buffer.from('{"event":"dispatched","source_code":"self"}', 'utf8');

describe('webhook гарын үсэг', () => {
  it('sha256=<hex> хэлбэртэй, тогтмол утга өгнө', () => {
    const sig = relaySignWebhook('s3cr3t', body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(relaySignWebhook('s3cr3t', body)).toBe(sig);
  });

  it('өөрийн гарын үсгээ шалгаж чадна', () => {
    expect(relayVerifyWebhook('s3cr3t', relaySignWebhook('s3cr3t', body), body)).toBe(true);
  });

  it('өөр нууц / өөрчлөгдсөн body-г ТАТГАЛЗАНА', () => {
    const sig = relaySignWebhook('s3cr3t', body);
    expect(relayVerifyWebhook('өөр-нууц', sig, body)).toBe(false);
    expect(relayVerifyWebhook('s3cr3t', sig, Buffer.from('{"event":"hacked"}', 'utf8'))).toBe(
      false,
    );
  });

  it('хоосон нууц эсвэл хоосон гарын үсэг нь ҮРГЭЛЖ false (fail-closed)', () => {
    expect(relayVerifyWebhook('', relaySignWebhook('', body), body)).toBe(false);
    expect(relayVerifyWebhook('s3cr3t', '', body)).toBe(false);
  });

  it('өөр урттай гарын үсгэнд ч алдаа шидэхгүй, зүгээр false', () => {
    expect(relayVerifyWebhook('s3cr3t', 'sha256=deadbeef', body)).toBe(false);
  });

  it('гарын үсгийн эргэн тойрны хоосон зайг тоохгүй', () => {
    const sig = relaySignWebhook('s3cr3t', body);
    expect(relayVerifyWebhook('s3cr3t', `  ${sig}  `, body)).toBe(true);
  });

  it('шинэ нууц нь 64-hex, давтагдахгүй', () => {
    const a = relayNewWebhookSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(relayNewWebhookSecret()).not.toBe(a);
  });
});

describe('demo endpoint', () => {
  it('хоосон болон demo:// нь гадаад дуудлагагүй гэж тооцогдоно', () => {
    expect(relayIsDemoEndpoint('')).toBe(true);
    expect(relayIsDemoEndpoint('   ')).toBe(true);
    expect(relayIsDemoEndpoint('demo://loopback')).toBe(true);
  });

  it('бодит HTTP хаяг нь demo БИШ', () => {
    expect(relayIsDemoEndpoint('https://peer.example.mn/hook')).toBe(false);
  });
});

describe('SLA сануулгын босго', () => {
  const start = new Date('2026-07-26T00:00:00Z');
  const due = new Date('2026-07-26T01:00:00Z'); // 60 минут

  it('цонхны 50%-д сануулга шаардлагагүй', () => {
    expect(relayRemindersDue(start, due, new Date('2026-07-26T00:30:00Z'))).toBe(0);
  });

  it('75% дээр нэг, 90% дээр хоёр сануулга', () => {
    expect(relayRemindersDue(start, due, new Date('2026-07-26T00:45:00Z'))).toBe(1);
    expect(relayRemindersDue(start, due, new Date('2026-07-26T00:54:00Z'))).toBe(2);
  });

  it('хугацаа хэтэрсэн ч дээд тал нь 2 (босгын тоо)', () => {
    expect(relayRemindersDue(start, due, new Date('2026-07-26T09:00:00Z'))).toBe(2);
  });

  it('цонх тэг эсвэл сөрөг бол 0 (тэглэлээр хуваахгүй)', () => {
    expect(relayRemindersDue(start, start, new Date('2026-07-26T00:30:00Z'))).toBe(0);
    expect(relayRemindersDue(due, start, new Date('2026-07-26T00:30:00Z'))).toBe(0);
  });
});
