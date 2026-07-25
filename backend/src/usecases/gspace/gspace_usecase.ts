// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/gspace нь "Gerege Space" (апп-ын өөрийн SFTP хадгалалт)-ын бизнес
// логик: хэрэглэгч-тус-бүрийн файл жагсаах/оруулах/татах/устгах + КВОТ шалгалт.
//
// Квотыг ЭНЭ давхаргад шалгана (client биш) — client нь зөвхөн тээвэр. Квот
// хэтрэлт нь 400 (5xx биш): хэрэглэгчийн засаж болох алдаа.

import {
  badRequest,
  DomainError,
  ErrorType,
  internalCause,
  notFound,
} from '../../apperror/index.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { FileInfo, GSpaceClient } from '../../pkg/gspace/gspace.js';

/** defaultQuotaBytes нь нэг хэрэглэгчийн өгөгдмөл квот (2 MiB). */
const defaultQuotaBytes = 2 << 20;

/** Overview нь хэрэглэгчийн Gerege Space-ийн товч (файлууд + ашиглалт/квот). */
export interface Overview {
  files: FileInfo[];
  used: number;
  limit: number;
}

export interface GSpaceUsecase {
  /** overview нь файлууд + ашигласан/нийт эзлэхүүнийг буцаана. */
  overview(ctx: Ctx, userId: string): Promise<Overview>;
  /** upload нь файл оруулна — квот хэтэрвэл 400-аар татгалзана. */
  upload(ctx: Ctx, userId: string, name: string, data: Buffer): Promise<void>;
  /** download нь файлын агуулгыг буцаана. */
  download(ctx: Ctx, userId: string, name: string): Promise<Buffer>;
  /** deleteFile нь файлыг устгана. */
  deleteFile(ctx: Ctx, userId: string, name: string): Promise<void>;
  /** limit нь нэг хэрэглэгчийн квот (байт). */
  limit(): number;
}

/** notConfigured нь SFTP тохируулаагүй үеийн нэгдсэн алдаа. */
const notConfigured = (): DomainError =>
  new DomainError(ErrorType.Internal, 'Gerege Space тохируулаагүй байна');

/** mb нь байтыг MB болгож мессежид тавина. */
const mb = (bytes: number): string => String(Math.floor(bytes / (1 << 20)));

class GSpaceUsecaseImpl implements GSpaceUsecase {
  private readonly quota: number;

  constructor(
    private readonly client: GSpaceClient,
    quota: number,
  ) {
    this.quota = quota <= 0 ? defaultQuotaBytes : quota;
  }

  limit(): number {
    return this.quota;
  }

  async overview(_ctx: Ctx, userId: string): Promise<Overview> {
    if (!this.client.configured()) throw notConfigured();
    let files: FileInfo[];
    try {
      files = await this.client.list(userId);
    } catch (err) {
      throw internalCause(err);
    }
    const used = files.reduce((total, f) => total + f.size, 0);
    return { files, used, limit: this.quota };
  }

  async upload(_ctx: Ctx, userId: string, name: string, data: Buffer): Promise<void> {
    if (!this.client.configured()) throw notConfigured();
    if (name.trim() === '' || data.length === 0) throw badRequest('Файл дутуу байна');
    if (data.length > this.quota) {
      throw badRequest(`Файл хэт том — квот ${mb(this.quota)} MB`);
    }

    // Одоогийн ашиглалт + шинэ файл нийлбэр квотоос хэтрэхгүй байх ЁСТОЙ. Ижил
    // нэртэй файл байвал ОРЛУУЛАГДАНА тул түүний хэмжээг хасна — эс бөгөөс
    // хэрэглэгч өөрийн файлаа дахин хадгалахад л квот дүүрсэн болно.
    let used: number;
    try {
      used = await this.client.usage(userId);
      const existing = await this.existingSize(userId, name);
      if (existing > 0) used -= existing;
    } catch (err) {
      throw internalCause(err);
    }
    if (used + data.length > this.quota) {
      throw badRequest(`Зай хүрэлцэхгүй — квот ${mb(this.quota)} MB`);
    }

    try {
      await this.client.upload(userId, name, data);
    } catch (err) {
      throw internalCause(err);
    }
  }

  /** existingSize нь ижил нэртэй файлын одоогийн хэмжээ (орлуулах үед хасна). */
  private async existingSize(userId: string, name: string): Promise<number> {
    let files: FileInfo[];
    try {
      files = await this.client.list(userId);
    } catch {
      // Жагсаалт уншиж чадахгүй бол хасалт хийхгүй — квотыг ХАТУУ талд нь барина.
      return 0;
    }
    const base = name.trim();
    return files.find((f) => f.name === base)?.size ?? 0;
  }

  async download(_ctx: Ctx, userId: string, name: string): Promise<Buffer> {
    if (!this.client.configured()) throw notConfigured();
    try {
      return await this.client.download(userId, name);
    } catch {
      // Татаж чадаагүй БҮХ шалтгааныг "олдсонгүй" болгоно — өөр хэрэглэгчийн
      // файлын оршихуйг алдааны ялгаагаар илчлэхгүй.
      throw notFound('Файл олдсонгүй');
    }
  }

  async deleteFile(_ctx: Ctx, userId: string, name: string): Promise<void> {
    if (!this.client.configured()) throw notConfigured();
    try {
      await this.client.deleteFile(userId, name);
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newGSpaceUsecase = (client: GSpaceClient, quota: number): GSpaceUsecase =>
  new GSpaceUsecaseImpl(client, quota);
