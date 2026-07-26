// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// audit usecase-ийн unit тестүүд. Гол зорилго: actor/request_id-г дуудагч мартаж
// чадахгүй байх (контекстээс автоматаар авна), occurred_at нь JS-ээс гарах,
// recordEventSafely нь гол урсгалыг унагахгүй байх.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type { AuditRepository } from '../../datasources/repositories/interface/audit.js';
import type { ChainEntry } from '../../pkg/audit/chain.js';
import { background, withAdmin, withUser } from '../../pkg/ctx/ctx.js';
import { newAuditUsecase, recordEventSafely } from './audit_usecase.js';

function mockRepo(over: Partial<AuditRepository> = {}): AuditRepository {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    append: vi.fn(no),
    list: vi.fn(no),
    verifyChain: vi.fn(no),
    ...over,
  };
}

describe('recordEvent', () => {
  it('actor-г RLS identity-аас, request_id-г контекстээс авна', async () => {
    let captured: ChainEntry | undefined;
    const append = vi.fn((_c, e: ChainEntry) => {
      captured = e;
      return Promise.resolve('hash');
    });
    const ctx = { ...withUser(background(), 'user-9'), requestId: 'req-42' };

    await newAuditUsecase(mockRepo({ append })).recordEvent(ctx, 'a.b', 'cat', 'tgt', { n: 1 });

    expect(captured?.actorUserId).toBe('user-9');
    expect(captured?.requestId).toBe('req-42');
    expect(captured?.action).toBe('a.b');
    expect(captured?.category).toBe('cat');
    expect(captured?.target).toBe('tgt');
    expect(captured?.metadata).toEqual({ n: 1 });
  });

  it('admin identity-ийн userId-г ч actor болгоно', async () => {
    let captured: ChainEntry | undefined;
    const append = vi.fn((_c, e: ChainEntry) => {
      captured = e;
      return Promise.resolve('h');
    });
    await newAuditUsecase(mockRepo({ append })).recordEvent(
      withAdmin(background(), 'admin-1'),
      'x',
      '',
      '',
      null,
    );
    expect(captured?.actorUserId).toBe('admin-1');
  });

  it('identity-гүй (системийн) урсгалд actor хоосон — бичилт зогсохгүй', async () => {
    let captured: ChainEntry | undefined;
    const append = vi.fn((_c, e: ChainEntry) => {
      captured = e;
      return Promise.resolve('h');
    });
    await newAuditUsecase(mockRepo({ append })).recordEvent(
      background(),
      'sys.event',
      '',
      '',
      null,
    );
    expect(captured?.actorUserId).toBe('');
    expect(captured?.requestId).toBe('');
  });

  it('occurred_at-ыг ӨӨРӨӨ тавина (SQL now() хэрэглэхгүй)', async () => {
    let captured: ChainEntry | undefined;
    const append = vi.fn((_c, e: ChainEntry) => {
      captured = e;
      return Promise.resolve('h');
    });
    const before = Date.now();
    await newAuditUsecase(mockRepo({ append })).recordEvent(background(), 'x', '', '', null);
    const after = Date.now();

    expect(captured?.occurredAt).toBeInstanceOf(Date);
    const t = captured?.occurredAt.getTime() ?? 0;
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('action хоосон бол 400 (repo хүрэхгүй)', async () => {
    const append = vi.fn(() => Promise.resolve('h'));
    await expect(
      newAuditUsecase(mockRepo({ append })).recordEvent(background(), '', 'c', 't', null),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
    expect(append).not.toHaveBeenCalled();
  });
});

describe('listEvents', () => {
  it('filter болон хуудаслалтыг repository руу дамжуулна', async () => {
    const list = vi.fn(() => Promise.resolve([]));
    const ctx = background();
    await newAuditUsecase(mockRepo({ list })).listEvents(
      ctx,
      { action: 'auth.eid.login', actorUserId: 'u1' },
      25,
      50,
    );
    expect(list).toHaveBeenCalledWith(ctx, { action: 'auth.eid.login', actorUserId: 'u1' }, 25, 50);
  });
});

describe('verifyChain', () => {
  it('бүрэн гинжийг ok=true-гээр буцаана', async () => {
    const uc = newAuditUsecase(
      mockRepo({ verifyChain: vi.fn(() => Promise.resolve({ ok: true, brokenId: 0 })) }),
    );
    expect(await uc.verifyChain(background())).toEqual({ ok: true, brokenId: 0 });
  });

  it('эвдэрсэн мөрийн id-г дамжуулна', async () => {
    const uc = newAuditUsecase(
      mockRepo({ verifyChain: vi.fn(() => Promise.resolve({ ok: false, brokenId: 17 })) }),
    );
    expect(await uc.verifyChain(background())).toEqual({ ok: false, brokenId: 17 });
  });
});

describe('recordEventSafely', () => {
  it('алдааг залгиж onError-оор мэдэгдэнэ (гол урсгал үргэлжилнэ)', async () => {
    const onError = vi.fn();
    const uc = newAuditUsecase(
      mockRepo({ append: vi.fn(() => Promise.reject(new Error('db down'))) }),
    );
    await expect(
      recordEventSafely(uc, background(), 'x', 'c', 't', null, onError),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('usecase null бол чимээгүй алгасна', async () => {
    const onError = vi.fn();
    await expect(
      recordEventSafely(null, background(), 'x', 'c', 't', null, onError),
    ).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('амжилттай үед onError дуудагдахгүй', async () => {
    const onError = vi.fn();
    const uc = newAuditUsecase(mockRepo({ append: vi.fn(() => Promise.resolve('h')) }));
    await recordEventSafely(uc, background(), 'x', 'c', 't', null, onError);
    expect(onError).not.toHaveBeenCalled();
  });
});
