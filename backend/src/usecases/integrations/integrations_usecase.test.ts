// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// integrations usecase-ийн unit тестүүд. Гол зорилго: OAuth токен DB-д ИЛ
// текстээр хэзээ ч очихгүй, production-д default түлхүүр татгалзагдах,
// танихгүй провайдер DB-д хүрэхгүй байх.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type {
  NewUserIntegration,
  UserIntegrationRepository,
} from '../../datasources/repositories/interface/user_integration.js';
import type { UserIntegration } from '../../domain/user_integration.js';
import { background } from '../../pkg/ctx/ctx.js';
import { newIntegrationsUsecase } from './integrations_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';
const encKey = 'test-integration-encryption-key';

function row(over: Partial<UserIntegration> = {}): UserIntegration {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    userId,
    provider: 'google-drive',
    accessToken: '',
    refreshToken: '',
    expiresAt: null,
    createdAt: new Date('2026-07-25T10:00:00Z'),
    updatedAt: null,
    ...over,
  };
}

function build(rows: UserIntegration[] = []) {
  const stored: NewUserIntegration[] = [];
  const repo: UserIntegrationRepository = {
    upsert: vi.fn((_ctx: unknown, input: NewUserIntegration) => {
      stored.push(input);
      return Promise.resolve(row({ ...input }));
    }),
    listByUser: vi.fn(() => Promise.resolve(rows)),
    deleteByUserAndProvider: vi.fn(() => Promise.resolve()),
  };
  return { uc: newIntegrationsUsecase(repo, encKey, false), repo, stored };
}

describe('шифрлэлтийн түлхүүр', () => {
  it('production-д хоосон түлхүүр ТАТГАЛЗАНА (fail-closed)', () => {
    const repo = {} as UserIntegrationRepository;
    expect(() => newIntegrationsUsecase(repo, '   ', true)).toThrow(/INTEGRATION_ENC_KEY/);
  });

  it('development-д хоосон түлхүүр зөвшөөрөгдөнө (boot зогсохгүй)', () => {
    const repo = {} as UserIntegrationRepository;
    expect(() => newIntegrationsUsecase(repo, '', false)).not.toThrow();
  });
});

describe('connect', () => {
  it('токен DB-д ИЛ ТЕКСТЭЭР очихгүй (шифрлэгдэнэ)', async () => {
    const { uc, stored } = build();
    await uc.connect(background(), {
      userId,
      provider: 'google-drive',
      accessToken: 'ya29.super-secret-access',
      refreshToken: '1//refresh-secret',
      expiresAt: new Date('2026-08-01T00:00:00Z'),
    });

    const saved = stored[0]!;
    expect(saved.accessToken).not.toContain('ya29');
    expect(saved.refreshToken).not.toContain('refresh-secret');
    // base64(nonce ‖ ciphertext ‖ tag) — nonce 12 + tag 16 байт л гэхэд 28.
    expect(Buffer.from(saved.accessToken, 'base64').length).toBeGreaterThan(28);
  });

  it('шифрлэсэн токен буцаад ЗӨВ задарна (round-trip)', async () => {
    const { uc, stored } = build();
    await uc.connect(background(), {
      userId,
      provider: 'dropbox',
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      expiresAt: null,
    });

    const saved = stored[0]!;
    const reader = build([
      row({
        provider: 'dropbox',
        accessToken: saved.accessToken,
        refreshToken: saved.refreshToken,
      }),
    ]);
    await expect(reader.uc.token(background(), userId, 'dropbox')).resolves.toEqual({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      expiresAt: null,
    });
  });

  it('refresh_token хоосон бол хоосноор үлдэнэ (зарим провайдер өгдөггүй)', async () => {
    const { uc, stored } = build();
    await uc.connect(background(), {
      userId,
      provider: 'google-meet',
      accessToken: 'a',
      refreshToken: '',
      expiresAt: null,
    });
    expect(stored[0]?.refreshToken).toBe('');
  });

  it('танихгүй провайдер DB-д ХҮРЭХГҮЙ (400)', async () => {
    const { uc, repo } = build();
    await expect(
      uc.connect(background(), {
        userId,
        provider: 'evil-corp',
        accessToken: 'a',
        refreshToken: '',
        expiresAt: null,
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('access_token хоосон бол 400', async () => {
    const { uc } = build();
    await expect(
      uc.connect(background(), {
        userId,
        provider: 'dropbox',
        accessToken: '   ',
        refreshToken: '',
        expiresAt: null,
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });
});

describe('list / disconnect / token', () => {
  it('list нь ТОКЕН буцаахгүй', async () => {
    const { uc } = build([row({ accessToken: 'enc', refreshToken: 'enc2' })]);
    const out = await uc.list(background(), userId);
    expect(out).toEqual([
      { provider: 'google-drive', expiresAt: null, connectedAt: new Date('2026-07-25T10:00:00Z') },
    ]);
    expect(JSON.stringify(out)).not.toContain('enc');
  });

  it('холбоогүй провайдерын токен 404', async () => {
    const { uc } = build([row({ provider: 'dropbox' })]);
    await expect(uc.token(background(), userId, 'google-drive')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.NotFound),
    );
  });

  it('гэмтсэн/өөр түлхүүрээр шифрлэгдсэн токен нь ДОТООД алдаа', async () => {
    // Шифрлэгдээгүй энгийн base64 — GCM-ийн tag шалгалт унана. (Literal-аар
    // бичихгүй: өндөр энтропитой мөр нь secret-scanner-ийг дэмий асаадаг.)
    const notEncrypted = Buffer.from('not-encrypted-at-all', 'utf8').toString('base64');
    const { uc } = build([row({ accessToken: notEncrypted })]);
    await expect(uc.token(background(), userId, 'google-drive')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
  });

  it('салгах нь танихгүй провайдерт 400', async () => {
    const { uc, repo } = build();
    await expect(uc.disconnect(background(), userId, 'nope')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    expect(repo.deleteByUserAndProvider).not.toHaveBeenCalled();
  });

  it('салгах нь идемпотент (мөр байхгүй ч амжилттай)', async () => {
    const { uc } = build();
    await expect(uc.disconnect(background(), userId, 'dropbox')).resolves.toBeUndefined();
  });
});
