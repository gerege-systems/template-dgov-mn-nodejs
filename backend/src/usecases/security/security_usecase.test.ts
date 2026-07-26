// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Security event usecase-ийн unit тестүүд. Гол зорилго: kind заавал байх,
// хоосон зай зассан утга DB-д хүрэх, repository-ийн алдаа клиентэд дэлгэрэнгүй
// БҮҮ гарах (internal).

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type {
  SecurityEventRecord,
  SecurityEventRepository,
} from '../../datasources/repositories/interface/security.js';
import { background, withUser, type Ctx } from '../../pkg/ctx/ctx.js';
import { newSecurityUsecase, type IngestRequest } from './security_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';

function mockRepo(over: Partial<SecurityEventRepository> = {}): SecurityEventRepository {
  return {
    ingest: vi.fn(() => Promise.resolve()),
    list: vi.fn(() => Promise.resolve([])),
    ...over,
  };
}

function ingestReq(over: Partial<IngestRequest> = {}): IngestRequest {
  return {
    userId,
    kind: 'rasp.jailbreak',
    severity: 'high',
    source: 'mobile',
    userAgent: 'Mozilla/5.0',
    ip: '203.0.113.7',
    detail: { hook: 'frida' },
    ...over,
  };
}

describe('security usecase — ingest', () => {
  it('event-ийг repository руу дамжуулна', async () => {
    const ingest = vi.fn((_ctx: Ctx, _e: Omit<SecurityEventRecord, 'id' | 'receivedAt'>) =>
      Promise.resolve(),
    );
    const repo = mockRepo({ ingest });
    const uc = newSecurityUsecase(repo);
    const ctx = withUser(background(), userId);

    await uc.ingest(ctx, ingestReq());

    expect(ingest).toHaveBeenCalledWith(ctx, {
      userId,
      kind: 'rasp.jailbreak',
      severity: 'high',
      source: 'mobile',
      userAgent: 'Mozilla/5.0',
      ip: '203.0.113.7',
      detail: { hook: 'frida' },
    });
  });

  it('kind хоосон бол 400 — DB-д хүрэхгүй', async () => {
    const ingest = vi.fn((_ctx: Ctx, _e: Omit<SecurityEventRecord, 'id' | 'receivedAt'>) =>
      Promise.resolve(),
    );
    const repo = mockRepo({ ingest });
    const uc = newSecurityUsecase(repo);

    await expect(uc.ingest(background(), ingestReq({ kind: '   ' }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(ingest).not.toHaveBeenCalled();
  });

  it('kind/severity/source-ийн хоосон зайг зассаны дараа хадгална', async () => {
    const ingest = vi.fn((_ctx: Ctx, _e: Omit<SecurityEventRecord, 'id' | 'receivedAt'>) =>
      Promise.resolve(),
    );
    const repo = mockRepo({ ingest });
    const uc = newSecurityUsecase(repo);

    await uc.ingest(
      background(),
      ingestReq({ kind: '  integrity.tamper  ', severity: ' low ', source: '  web ' }),
    );

    const rec = ingest.mock.calls[0]?.[1];
    expect(rec?.kind).toBe('integrity.tamper');
    expect(rec?.severity).toBe('low');
    expect(rec?.source).toBe('web');
  });

  it('user-agent болон IP-г ХЭВЭЭР дамжуулна (сервер тэмдэглэсэн нотолгоо)', async () => {
    const ingest = vi.fn((_ctx: Ctx, _e: Omit<SecurityEventRecord, 'id' | 'receivedAt'>) =>
      Promise.resolve(),
    );
    const repo = mockRepo({ ingest });
    const uc = newSecurityUsecase(repo);

    await uc.ingest(background(), ingestReq({ userAgent: '  Bot/1.0  ', ip: '2001:db8::1' }));

    const rec = ingest.mock.calls[0]?.[1];
    expect(rec?.userAgent).toBe('  Bot/1.0  ');
    expect(rec?.ip).toBe('2001:db8::1');
  });

  it('repository алдаа ДОТООД алдаа болно (Postgres-ийн дэлгэрэнгүй гарахгүй)', async () => {
    const repo = mockRepo({
      ingest: vi.fn(() =>
        Promise.reject(new Error('new row violates row-level security policy for table')),
      ),
    });
    const uc = newSecurityUsecase(repo);

    await expect(uc.ingest(background(), ingestReq())).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
  });
});

describe('security usecase — list', () => {
  it('хуудаслалтыг repository руу дамжуулж мөрүүдийг буцаана', async () => {
    const rows: SecurityEventRecord[] = [
      {
        id: 7,
        receivedAt: new Date('2026-07-25T10:00:00Z'),
        userId,
        kind: 'anomaly.timing',
        severity: 'medium',
        source: '',
        userAgent: '',
        ip: '',
        detail: null,
      },
    ];
    const list = vi.fn(() => Promise.resolve(rows));
    const repo = mockRepo({ list });
    const uc = newSecurityUsecase(repo);
    const ctx = background();

    await expect(uc.list(ctx, 25, 50)).resolves.toEqual(rows);
    expect(list).toHaveBeenCalledWith(ctx, 25, 50);
  });

  it('repository алдаа ДОТООД алдаа болно', async () => {
    const repo = mockRepo({ list: vi.fn(() => Promise.reject(new Error('connection reset'))) });
    const uc = newSecurityUsecase(repo);

    await expect(uc.list(background(), 50, 0)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
  });
});
