// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Gerege Core (core.gerege.mn) клиент. Token нь урт настай service bearer
// (CORE_API_TOKEN) — ЗӨВХӨН серверийн талд хадгалагдана, хариунд хэзээ ч гарахгүй.

import { internalCause } from '../../apperror/index.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { CoreUsecase } from './core_usecase.js';

/** maxRespBytes нь Core-ийн хариунаас уншиж болох дээд хэмжээ (4 MiB). */
const maxRespBytes = 4 << 20;
/** httpTimeoutMs нь Core руу хийх дуудлагын timeout. */
const httpTimeoutMs = 15_000;

/**
 * notConfigured нь CORE_API_TOKEN тохируулаагүй үеийн хариу. Core инерт байх нь
 * 500 БИШ — UI-д ойлгомжтой мессежээр (илэрцгүй шалтгаан) буцна. CoreSearchView
 * нь энэ `message`-ийг харуулдаг тул оператор Core-г идэвхжүүлэхэд юу дутууг
 * шууд ойлгоно.
 */
const notConfigured = {
  message:
    'Core үйлчилгээ (core.gerege.mn) тохируулаагүй байна. CORE_API_TOKEN-ыг backend.env-д тохируулна уу.',
};

class CoreUsecaseImpl implements CoreUsecase {
  private readonly base: string;

  constructor(
    base: string,
    private readonly token: string,
  ) {
    this.base = base.replace(/\/+$/, '');
  }

  async findUsers(ctx: Ctx, searchText: string): Promise<unknown> {
    return await this.call(ctx, 'POST', '/api/user/find', '', { search_text: searchText });
  }

  async findOrganizations(ctx: Ctx, searchText: string): Promise<unknown> {
    const q = new URLSearchParams({ search_text: searchText });
    return await this.call(ctx, 'GET', '/api/organization/find', q.toString(), undefined);
  }

  /**
   * call нь Core руу хийх бүх дуудлагын нэгдсэн гарц: bearer header, дуудагчийн
   * цуцлалт + 15с timeout, хариуны хэмжээний хязгаар, JSON эсэхийн шалгалт.
   *
   * Хариу JSON биш (эсвэл 4 MiB-аас хэтэрсэн тул тайрагдсан) бол `null` буцна —
   * Core-ийн эвдэрсэн хариу апп-ыг 500 болгохгүй.
   */
  private async call(
    ctx: Ctx,
    method: 'GET' | 'POST',
    path: string,
    query: string,
    body: unknown,
  ): Promise<unknown> {
    if (this.token === '') return notConfigured;

    let endpoint = this.base + path;
    if (query !== '') endpoint += `?${query}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    // Дуудагчийн цуцлалт БОЛОН өөрийн timeout хоёуланг хүндэтгэнэ.
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw internalCause(
        new Error(`core request: ${err instanceof Error ? err.message : String(err)}`),
      );
    }

    // Хортой/эвдэрсэн хариу санах ойг барихгүй байхаар хэмжээг хязгаарлана.
    let buf: Buffer;
    try {
      buf = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      throw internalCause(
        new Error(`core read: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
    if (res.status < 200 || res.status >= 300) {
      throw internalCause(new Error(`core api returned ${String(res.status)}`));
    }

    const raw = buf.subarray(0, maxRespBytes).toString('utf8');
    try {
      // Хариуг задлан дамжуулна. (Go нь json.RawMessage-ээр байт хэлбэрээр
      // дамжуулдаг; Node дээр задлаад дахин сериалчилдаг тул 2^53-аас том БҮХЭЛ
      // тоо байвал хэлбэр өөрчлөгдөж болно — Core-ийн ID-ууд мөр/бага тоо тул
      // практикт нөлөөгүй.)
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

/**
 * newCoreUsecase нь Gerege Core клиентийг үүсгэнэ. token хоосон бол домэйн
 * инерт болж, тохируулаагүй гэсэн мессеж буцаана.
 */
export const newCoreUsecase = (base: string, token: string): CoreUsecase =>
  new CoreUsecaseImpl(base, token);
