// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Гуравдагч талын үйлдлийн давхаргын тест. Гол баталгаанууд:
//   • хугацаа дуусах гэж буй токеныг шинэчилж, ШИНЭЧИЛСНИЙГ хадгална;
//   • провайдер шинэ refresh_token өгөөгүй бол ХУУЧНЫГ хэвээр хадгална;
//   • шинэчлэл бүтэлгүйтвэл ХУУЧИН токеноор үргэлжилнэ (түр саатал холболтыг
//     тасалж болохгүй);
//   • провайдерын 401 нь платформын 401 БИШ (400) — SPA хэрэглэгчийг үндэслэлгүй
//     login руу шидэхгүй;
//   • Dropbox-ийн preview зам нь апп-ын хавтсаар хязгаарлагдана.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorType } from '../../apperror/index.js';
import { AppConfig } from '../../config/config.js';
import { background } from '../../pkg/ctx/ctx.js';
import { ProviderApiError } from '../../pkg/cloudfiles/cloudfiles.js';
import * as cloudfiles from '../../pkg/cloudfiles/cloudfiles.js';
import * as providers from '../../pkg/oauthproviders/oauthproviders.js';
import { newProviderOps } from './integrations_provider.js';
import type { IntegrationsUsecase } from './integrations_usecase.js';

const ctx = background();

const savedConfig = {
  GOOGLE_DRIVE_CLIENT_ID: AppConfig.GOOGLE_DRIVE_CLIENT_ID,
  GOOGLE_DRIVE_CLIENT_SECRET: AppConfig.GOOGLE_DRIVE_CLIENT_SECRET,
  DROPBOX_CLIENT_ID: AppConfig.DROPBOX_CLIENT_ID,
  DROPBOX_CLIENT_SECRET: AppConfig.DROPBOX_CLIENT_SECRET,
};

let connectMock: ReturnType<typeof vi.fn>;
let tokenMock: ReturnType<typeof vi.fn>;
let uc: IntegrationsUsecase;

beforeEach(() => {
  AppConfig.GOOGLE_DRIVE_CLIENT_ID = 'cid';
  AppConfig.GOOGLE_DRIVE_CLIENT_SECRET = 'secret';
  AppConfig.DROPBOX_CLIENT_ID = 'cid';
  AppConfig.DROPBOX_CLIENT_SECRET = 'secret';
  connectMock = vi.fn(() => Promise.resolve());
  tokenMock = vi.fn();
  uc = {
    connect: connectMock,
    list: vi.fn(),
    disconnect: vi.fn(),
    token: tokenMock,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(AppConfig, savedConfig);
});

describe('токен шинэчлэл', () => {
  it('хугацаатай токеныг ШИНЭЧИЛЖ, шинийг ашиглана', async () => {
    tokenMock.mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      // 10 секундын дараа дуусна — refreshSkew (60с) дотор.
      expiresAt: new Date(Date.now() + 10_000),
    });
    vi.spyOn(providers, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'fresh',
      refreshToken: '',
      expiresAt: Date.now() + 3_600_000,
    });
    const listSpy = vi.spyOn(cloudfiles, 'driveListFiles').mockResolvedValue([]);

    await newProviderOps(uc).driveList(ctx, 'u-1');

    expect(listSpy).toHaveBeenCalledWith('fresh');
    // Шинэ refresh_token ирээгүй тул ХУУЧНЫГ хэвээр хадгална.
    expect(connectMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ accessToken: 'fresh', refreshToken: 'rt' }),
    );
  });

  it('хугацаа хол байвал шинэчлэхгүй', async () => {
    tokenMock.mockResolvedValue({
      accessToken: 'still-good',
      refreshToken: 'rt',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const refreshSpy = vi.spyOn(providers, 'refreshAccessToken');
    const listSpy = vi.spyOn(cloudfiles, 'driveListFiles').mockResolvedValue([]);

    await newProviderOps(uc).driveList(ctx, 'u-1');

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(listSpy).toHaveBeenCalledWith('still-good');
  });

  it('шинэчлэл бүтэлгүйтвэл ХУУЧИН токеноор үргэлжилнэ', async () => {
    tokenMock.mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      expiresAt: new Date(Date.now() + 10_000),
    });
    vi.spyOn(providers, 'refreshAccessToken').mockRejectedValue(new Error('network'));
    const listSpy = vi.spyOn(cloudfiles, 'driveListFiles').mockResolvedValue([]);

    await newProviderOps(uc).driveList(ctx, 'u-1');

    expect(listSpy).toHaveBeenCalledWith('old');
    expect(connectMock).not.toHaveBeenCalled();
  });
});

describe('алдааны зураглал', () => {
  beforeEach(() => {
    tokenMock.mockResolvedValue({ accessToken: 'at', refreshToken: '', expiresAt: null });
  });

  it('провайдерын 401 нь платформын 401 БИШ (400)', async () => {
    vi.spyOn(cloudfiles, 'driveListFiles').mockRejectedValue(new ProviderApiError(401, 'nope'));
    await expect(newProviderOps(uc).driveList(ctx, 'u-1')).rejects.toMatchObject({
      type: ErrorType.BadRequest,
    });
  });

  it('бусад алдаа нь дотоод 5xx (шалтгаан клиентэд гарахгүй)', async () => {
    vi.spyOn(cloudfiles, 'driveListFiles').mockRejectedValue(new ProviderApiError(500, 'boom'));
    await expect(newProviderOps(uc).driveList(ctx, 'u-1')).rejects.toMatchObject({
      type: ErrorType.Internal,
    });
  });

  it('тохируулаагүй провайдер дээр токен ч уншихгүй', async () => {
    AppConfig.GOOGLE_DRIVE_CLIENT_SECRET = '';
    await expect(newProviderOps(uc).driveList(ctx, 'u-1')).rejects.toMatchObject({
      type: ErrorType.BadRequest,
    });
    expect(tokenMock).not.toHaveBeenCalled();
  });
});

describe('Dropbox preview-ийн зам', () => {
  beforeEach(() => {
    tokenMock.mockResolvedValue({ accessToken: 'at', refreshToken: '', expiresAt: null });
  });

  it('апп-ын хавтаснаас ГАДУУРХ замыг татгалзана', async () => {
    const linkSpy = vi.spyOn(cloudfiles, 'dropboxTemporaryLink');
    await expect(
      newProviderOps(uc).dropboxPreviewLink(ctx, 'u-1', '/Private/secret.pdf'),
    ).rejects.toMatchObject({ type: ErrorType.BadRequest });
    expect(linkSpy).not.toHaveBeenCalled();
  });

  it('/Gerege доторх замыг зөвшөөрнө (том/жижиг үсэгт мэдрэг биш)', async () => {
    vi.spyOn(cloudfiles, 'dropboxTemporaryLink').mockResolvedValue('https://dl/x');
    await expect(newProviderOps(uc).dropboxPreviewLink(ctx, 'u-1', '/gerege/a.png')).resolves.toBe(
      'https://dl/x',
    );
  });
});
