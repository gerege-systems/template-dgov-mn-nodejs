// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Hash гинжийн БАЙТ-НИЙЦЛИЙН тест. Хүлээгдэж буй hash-ууд нь Go хувилбарын
// pkg/audit.ComputeChainHash-аас ГАРГАСАН эталон вектор — шилжилтийн үед Go болон
// Node хувилбар нэг DB хуваалцаж болох тул гинж хоёуланд ижил тооцоологдох ёстой.
//
// Вектор гаргасан арга: Go repo дээр нэг удаагийн `cmd/_hashvec` програм ажиллуулж
// гаралтыг доор бэхэлсэн (порт дууссан тул лавлагааны Go мод энэ repo-д БАЙХГҮЙ —
// эх нь gerege-systems/template-dgov-mn). Оролт:
//   ts = 2026-07-25T10:30:45.123Z (UTC, ms нарийвчлал)

import { describe, expect, it } from 'vitest';

import { canonicalJson, computeChainHash, goJsonString, type ChainEntry } from './chain.js';

const ts = new Date('2026-07-25T10:30:45.123Z');

function entry(over: Partial<ChainEntry> = {}): ChainEntry {
  return {
    occurredAt: ts,
    actorUserId: '',
    action: '',
    category: '',
    target: '',
    requestId: '',
    metadata: null,
    ...over,
  };
}

describe('Go-той байт-нийцэл (эталон вектор)', () => {
  it('genesis, хамгийн бага талбартай', () => {
    expect(computeChainHash('', entry({ action: 'auth.eid.login' }))).toBe(
      'a5e94b0809c2d2b0f0b7b2ae33e68199013a02771a7719ef3f5c88d377e3bb0b',
    );
  });

  it('бүх талбар + HTML escape шаардах metadata', () => {
    expect(
      computeChainHash(
        'abc123',
        entry({
          actorUserId: '3063e104-e523-46d4-bc33-a8ac74417530',
          action: 'rbac.role.permissions.set',
          category: 'rbac',
          target: '3',
          requestId: 'req-1',
          metadata: { permission_count: 4, note: 'a<b>c&d' },
        }),
      ),
    ).toBe('1ba1c152bb1c3d7f88c4b6948e824f252603b99a6296f0fd9c0877dadf044c71');
  });

  it('metadata null', () => {
    expect(
      computeChainHash(
        'deadbeef',
        entry({ actorUserId: 'u1', action: 'a', category: 'c', target: 't', requestId: 'r' }),
      ),
    ).toBe('f334cbd1f46e2d6a14e674bd676b16ce18cadea70ac66295939bd6a26edecb3e');
  });

  it('metadata түлхүүр эрэмбэлэгдэнэ (оруулсан дараалал хамаарахгүй)', () => {
    expect(
      computeChainHash('', entry({ action: 'x', metadata: { zeta: true, alpha: '1', mid: null } })),
    ).toBe('ed70e35760d26380bbceb6a4a3b95a8ab7118b4e90e96ac587154b97db5aed1c');
  });

  it('кирилл (UTF-8) тэмдэгт escape хийгдэхгүй', () => {
    expect(
      computeChainHash('', entry({ action: 'x', target: 'Дорж Бат', metadata: { мн: 'тийм' } })),
    ).toBe('ab68fe20ab6f86e7c374d14cc5a965908ab10504f1ed895b1df8362517f43d14');
  });
});

describe('goJsonString', () => {
  it('Go-ийн HTML-safe escape-ийг дагана', () => {
    expect(goJsonString('a<b>c&d')).toBe('"a\\u003cb\\u003ec\\u0026d"');
  });

  it('стандарт escape-ууд', () => {
    expect(goJsonString('q"\\\nx\tz')).toBe('"q\\"\\\\\\nx\\tz"');
  });

  it('ASCII биш тэмдэгтийг escape хийхгүй', () => {
    expect(goJsonString('Дорж')).toBe('"Дорж"');
  });

  it('хяналтын тэмдэгтийг \\u00XX болгоно', () => {
    expect(goJsonString('\u0001')).toBe('"\\u0001"');
  });
});

describe('canonicalJson', () => {
  it('талбарын дараалал ТОГТМОЛ (гинж эвдэхгүйн тулд)', () => {
    const json = canonicalJson(entry({ action: 'a' })).toString('utf8');
    expect(json).toBe(
      '{"occurred_at_ns":1784975445123000000,"actor_user_id":"","action":"a","category":"","target":"","request_id":"","metadata":null}',
    );
  });

  it('occurred_at_ns нь 2^53-аас том тул ЯГ цифрээ хадгална', () => {
    const json = canonicalJson(entry()).toString('utf8');
    const ns = /"occurred_at_ns":(\d+)/.exec(json)?.[1];
    expect(ns).toBe('1784975445123000000');
    // Number-ээр тооцвол дугуйрах эрсдэлтэйг ил харуулна.
    expect(Number.isSafeInteger(Number(ns))).toBe(false);
  });

  it('метадатагүй ба хоосон объект нь ӨӨР hash өгнө', () => {
    const a = computeChainHash('', entry({ action: 'x', metadata: null }));
    const b = computeChainHash('', entry({ action: 'x', metadata: {} }));
    expect(a).not.toBe(b);
  });
});

describe('гинжийн шинж', () => {
  it('prev_hash өөрчлөгдвөл hash өөрчлөгдөнө', () => {
    const e = entry({ action: 'x' });
    expect(computeChainHash('a', e)).not.toBe(computeChainHash('b', e));
  });

  it('нэг ч талбар өөрчлөгдвөл hash өөрчлөгдөнө', () => {
    const base = computeChainHash('p', entry({ action: 'x', target: 't' }));
    expect(computeChainHash('p', entry({ action: 'x', target: 't2' }))).not.toBe(base);
    expect(computeChainHash('p', entry({ action: 'y', target: 't' }))).not.toBe(base);
    expect(computeChainHash('p', entry({ action: 'x', target: 't', actorUserId: 'u' }))).not.toBe(
      base,
    );
  });

  it('цаг өөрчлөгдвөл hash өөрчлөгдөнө', () => {
    expect(computeChainHash('', entry({ action: 'x' }))).not.toBe(
      computeChainHash('', entry({ action: 'x', occurredAt: new Date(ts.getTime() + 1) })),
    );
  });
});
