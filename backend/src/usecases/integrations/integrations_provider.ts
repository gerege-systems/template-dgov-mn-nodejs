// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/integrations/provider нь ХАДГАЛСАН токеныг ашиглан гуравдагч талын
// API руу (Drive · Dropbox · Meet) сервер талаас хандах давхарга.
//
// ЯАГААД СЕРВЕР ТАЛД ВЭ: SPA нь статикаар түгээгддэг тул client_secret агуулж
// чадахгүй бөгөөд хэрэглэгчийн OAuth токен browser-т ХЭЗЭЭ Ч гарах ёсгүй
// (`GET /integrations/:provider/token` нь зөвхөн процессын дотоод хэрэглээ).
// Иймд файл жагсаах/хуулах, уулзалт үүсгэх зэрэг үйлдлүүд энд хийгдэж, SPA
// зөвхөн үр дүнг хүлээж авна.

import { randomBytes } from 'node:crypto';

import { badRequest, internalCause } from '../../apperror/index.js';
import {
  driveDelete,
  driveListFiles,
  driveRename,
  driveUpload,
  driveUploadSharedImage,
  dropboxList,
  dropboxTemporaryLink,
  dropboxUpload,
  DropboxFolder,
  meetCreateSpace,
  ProviderApiError,
  type DriveFile,
  type DropboxEntry,
  type MeetSpace,
} from '../../pkg/cloudfiles/cloudfiles.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';
import {
  getProvider,
  isConfigured,
  refreshAccessToken,
  type OAuthProvider,
  type ProviderID,
} from '../../pkg/oauthproviders/oauthproviders.js';
import type { IntegrationsUsecase } from './integrations_usecase.js';

const usecaseName = 'integrations';
const fileName = 'integrations_provider.ts';

/**
 * refreshSkewMs нь токеныг хугацаа дуусахаас хэр эрт шинэчлэхийг заана. Урт
 * ажиллагаатай хүсэлт (файл хуулах) дундуур токен дуусахаас сэргийлнэ.
 */
const refreshSkewMs = 60_000;

/**
 * uploadMaxBytes нь дамжуулах файлын дээд хэмжээ. Хүсэлтийн биеийн ерөнхий
 * хязгаараас гадна энд ил барина — гуравдагч тал руу хязгааргүй урсгал
 * дамжуулах нь энэ процессыг санах ойгоор шавхах зам болно.
 */
export const uploadMaxBytes = 10 * 1024 * 1024;

/** ProviderOps нь SPA-ийн шаарддаг сервер талын үйлдлүүдийн хил. */
export interface ProviderOps {
  /** driveList нь хэрэглэгчийн "Gerege" хавтасны файлуудыг жагсаана. */
  driveList(ctx: Ctx, userId: string): Promise<DriveFile[]>;
  /** driveUploadFile нь файлыг "Gerege" хавтас руу хуулна. */
  driveUploadFile(
    ctx: Ctx,
    userId: string,
    name: string,
    mime: string,
    data: Buffer,
  ): Promise<DriveFile>;
  /**
   * driveUploadImage нь зургийг хуулж, нийтэд харагдах URL буцаана — гарын
   * үсэг/тамганы зураг нь баримт дээр харагдах ёстой.
   */
  driveUploadImage(
    ctx: Ctx,
    userId: string,
    name: string,
    mime: string,
    data: Buffer,
  ): Promise<string>;
  /** driveRenameFile нь файлын нэрийг солино. */
  driveRenameFile(ctx: Ctx, userId: string, fileId: string, name: string): Promise<DriveFile>;
  /** driveDeleteFile нь файлыг устгана. */
  driveDeleteFile(ctx: Ctx, userId: string, fileId: string): Promise<void>;
  /** dropboxListFiles нь "/Gerege" хавтасны контентыг жагсаана. */
  dropboxListFiles(ctx: Ctx, userId: string): Promise<DropboxEntry[]>;
  /** dropboxPreviewLink нь файлын түр хугацааны шууд линк буцаана. */
  dropboxPreviewLink(ctx: Ctx, userId: string, path: string): Promise<string>;
  /** dropboxUploadFile нь файлыг "/Gerege" хавтас руу хуулна. */
  dropboxUploadFile(
    ctx: Ctx,
    userId: string,
    name: string,
    data: Buffer,
  ): Promise<Record<string, unknown>>;
  /** meetCreate нь шинэ Google Meet уулзалт үүсгэнэ. */
  meetCreate(ctx: Ctx, userId: string): Promise<MeetSpace>;
}

/**
 * mapProviderError нь гуравдагч талын алдааг клиентэд ойлгомжтой болгоно.
 * 401/403 нь "холболт хүчингүй" (хэрэглэгч дахин холбох ёстой) — үүнийг 400
 * болгож буцаана; бусад бүхэн дотоод 5xx (шалтгаан клиентэд гарахгүй).
 *
 * ЯАГААД 401 БИШ ВЭ: энэ API-ийн 401 нь "ПЛАТФОРМД нэвтрээгүй" гэсэн утгатай
 * бөгөөд SPA түүн дээр session-ээ дуусгаж login руу шиднэ. Гуравдагч талын
 * токен хүчингүй болсныг тэр урсгал руу оруулах нь хэрэглэгчийг үндэслэлгүй
 * гаргана.
 */
function mapProviderError(err: unknown, connectionMsg: string): never {
  if (err instanceof ProviderApiError && (err.status === 401 || err.status === 403)) {
    throw badRequest(connectionMsg);
  }
  throw internalCause(err instanceof Error ? err : new Error(String(err)));
}

/** randomBoundary нь multipart/related-ийн хилийн мөр (тааварлашгүй) үүсгэнэ. */
function randomBoundary(): string {
  return `gerege${randomBytes(12).toString('hex')}`;
}

class ProviderOpsImpl implements ProviderOps {
  constructor(private readonly integrations: IntegrationsUsecase) {}

  /**
   * accessToken нь хадгалсан токеныг буцаана; хугацаа дуусах гэж байгаа бол
   * refresh_token-оор шинэчилж, ШИНЭ токеныг (шифрлүүлэхээр) буцаан хадгална.
   *
   * Токен байхгүй бол `token` нь notFound шиднэ — дуудагч түүнийг "холбоогүй
   * байна" гэж харуулна.
   */
  private async accessToken(ctx: Ctx, userId: string, id: ProviderID): Promise<string> {
    const p = getProvider(id);
    if (!p || !isConfigured(p)) {
      throw badRequest(`${id} тохируулагдаагүй байна`);
    }

    const tok = await this.integrations.token(ctx, userId, id);
    const expiresMs = tok.expiresAt === null ? 0 : tok.expiresAt.getTime();
    const expiring = expiresMs > 0 && expiresMs - refreshSkewMs < Date.now();
    if (!expiring || tok.refreshToken === '') return tok.accessToken;

    return this.refreshAndStore(ctx, userId, p, tok.refreshToken, tok.accessToken);
  }

  /**
   * refreshAndStore нь токеныг шинэчилж хадгална. Шинэчлэл БҮТЭЛГҮЙТВЭЛ хуучин
   * токеныг буцаана — тэр нь бас ажиллаж болзошгүй (skew) бөгөөс эс бөгөөс
   * гуравдагч талын түр саатал хэрэглэгчийн холболтыг тасална.
   */
  private async refreshAndStore(
    ctx: Ctx,
    userId: string,
    p: OAuthProvider,
    refreshToken: string,
    fallback: string,
  ): Promise<string> {
    try {
      const fresh = await refreshAccessToken(p, refreshToken);
      await this.integrations.connect(ctx, {
        userId,
        provider: p.id,
        accessToken: fresh.accessToken,
        // Провайдер шинэ refresh_token буцаагаагүй бол хуучныг хэвээр хадгална —
        // эс бөгөөс дараагийн шинэчлэл боломжгүй болно.
        refreshToken: fresh.refreshToken === '' ? refreshToken : fresh.refreshToken,
        expiresAt: fresh.expiresAt > 0 ? new Date(fresh.expiresAt) : null,
      });
      return fresh.accessToken;
    } catch (err) {
      logger.errorWithContext(ctx, 'integration token refresh failed (non-fatal)', {
        usecase: usecaseName,
        method: 'refreshAndStore',
        file: fileName,
        step: 'oauth_refresh',
        provider: p.id,
        error: logger.errText(err),
      });
      return fallback;
    }
  }

  // ─────────────────────────── Google Drive ───────────────────────────

  async driveList(ctx: Ctx, userId: string): Promise<DriveFile[]> {
    const token = await this.accessToken(ctx, userId, 'google-drive');
    try {
      return await driveListFiles(token);
    } catch (err) {
      return mapProviderError(err, 'Google Drive холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  async driveUploadFile(
    ctx: Ctx,
    userId: string,
    name: string,
    mime: string,
    data: Buffer,
  ): Promise<DriveFile> {
    const token = await this.accessToken(ctx, userId, 'google-drive');
    try {
      return await driveUpload(token, name, mime, data, randomBoundary());
    } catch (err) {
      return mapProviderError(err, 'Google Drive холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  async driveUploadImage(
    ctx: Ctx,
    userId: string,
    name: string,
    mime: string,
    data: Buffer,
  ): Promise<string> {
    const token = await this.accessToken(ctx, userId, 'google-drive');
    try {
      return await driveUploadSharedImage(token, name, mime, data, randomBoundary());
    } catch (err) {
      return mapProviderError(err, 'Google Drive холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  async driveRenameFile(
    ctx: Ctx,
    userId: string,
    fileId: string,
    name: string,
  ): Promise<DriveFile> {
    const token = await this.accessToken(ctx, userId, 'google-drive');
    try {
      return await driveRename(token, fileId, name);
    } catch (err) {
      return mapProviderError(err, 'Google Drive холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  async driveDeleteFile(ctx: Ctx, userId: string, fileId: string): Promise<void> {
    const token = await this.accessToken(ctx, userId, 'google-drive');
    try {
      await driveDelete(token, fileId);
    } catch (err) {
      mapProviderError(err, 'Google Drive холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  // ───────────────────────────── Dropbox ─────────────────────────────

  async dropboxListFiles(ctx: Ctx, userId: string): Promise<DropboxEntry[]> {
    const token = await this.accessToken(ctx, userId, 'dropbox');
    try {
      return await dropboxList(token);
    } catch (err) {
      return mapProviderError(err, 'Dropbox холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  async dropboxPreviewLink(ctx: Ctx, userId: string, path: string): Promise<string> {
    // Зөвхөн апп-ын өөрийн хавтас доторх зам — эс бөгөөс хэрэглэгчийн бүх
    // Dropbox-ийн дурын файлын линкийг энэ endpoint-оор гаргаж болно.
    if (!path.toLowerCase().startsWith(`${DropboxFolder.toLowerCase()}/`)) {
      throw badRequest('зам буруу байна');
    }
    const token = await this.accessToken(ctx, userId, 'dropbox');
    try {
      return await dropboxTemporaryLink(token, path);
    } catch (err) {
      return mapProviderError(err, 'Dropbox холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  async dropboxUploadFile(
    ctx: Ctx,
    userId: string,
    name: string,
    data: Buffer,
  ): Promise<Record<string, unknown>> {
    const token = await this.accessToken(ctx, userId, 'dropbox');
    try {
      return await dropboxUpload(token, name, data);
    } catch (err) {
      return mapProviderError(err, 'Dropbox холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }

  // ─────────────────────────── Google Meet ───────────────────────────

  async meetCreate(ctx: Ctx, userId: string): Promise<MeetSpace> {
    const token = await this.accessToken(ctx, userId, 'google-meet');
    try {
      return await meetCreateSpace(token);
    } catch (err) {
      return mapProviderError(err, 'Google Meet холболт хүчингүй боллоо. Дахин холбоно уу.');
    }
  }
}

/** newProviderOps нь гуравдагч талын үйлдлийн давхаргыг үүсгэнэ. */
export function newProviderOps(integrations: IntegrationsUsecase): ProviderOps {
  return new ProviderOpsImpl(integrations);
}
