// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// eID RP client-ийн ХАМГИЙН ДООД түвшний HTTP давхарга. Go хувилбарт client
// struct-ийн method-ууд (post/get/put/del) бөгөөд eid.go · eid_pki.go хоёул
// хуваалцдаг; TypeScript-д класс файл дамжиж тархаж чаддаггүй тул transport-ыг
// ийнхүү тусад нь гаргаж, auth (eid.ts) · organization (eid_org.ts) · PKI
// (eid_pki.ts) модулиуд түүнийг НЭГ ХЭВЭЭР хуваалцана.
//
// Энэ давхарга алдаа ТАЙЛБАРЛАДАГГҮЙ: статус кодыг дуудагчид дамжуулна (403 нь
// endpoint-оос хамааран ErrNotRepresentative эсвэл ErrPKINotPermitted болдог).

/** maxRespBytes нь IdP-ийн хариунаас уншиж болох дээд хэмжээ. */
const maxRespBytes = 256 << 10;
/** Poll нь 25с хүртэл long-poll хийдэг тул HTTP timeout-ийг 30с болгов. */
const httpTimeoutMs = 30_000;

/** HttpMethod нь IdP-д хэрэглэгддэг HTTP method-ууд. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** EidResponse нь задлагдаагүй хариу + HTTP статус. */
export interface EidResponse {
  raw: string;
  status: number;
}

/** snippet нь алдааны мессежид тавих хариуны эхний 200 тэмдэгтийг буцаана. */
export function snippet(raw: string): string {
  const s = raw.trim();
  return s.length > 200 ? s.slice(0, 200) : s;
}

/** parseJSON нь хариуг задлана; JSON биш бол контексттэй алдаа шиднэ. */
export function parseJSON<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${context}: invalid response: ${snippet(raw)}`);
  }
}

/**
 * EidRequester нь transport-ийн НИЙТИЙН гэрээ. Модулиуд (eid_org · eid_pki)
 * ҮҮНИЙГ хүлээж авдаг тул тест нь хуурамч transport-ыг `as unknown` cast-гүйгээр
 * дамжуулж чадна (класс нь private талбартай учир структурын нийцэлд ордоггүй).
 */
export interface EidRequester {
  request(
    method: HttpMethod,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<EidResponse>;
  get(path: string, signal?: AbortSignal): Promise<EidResponse>;
  post(path: string, body?: unknown, signal?: AbortSignal): Promise<EidResponse>;
  put(path: string, body?: unknown, signal?: AbortSignal): Promise<EidResponse>;
  del(path: string, signal?: AbortSignal): Promise<EidResponse>;
}

/**
 * EidHttp нь IdP руу хийх бүх дуудлагын нэгдсэн гарц: RP Bearer secret-ийг
 * header-т тавьж (log-д хэзээ ч гарахгүй), хариуны биеийг maxRespBytes-ээр
 * хязгаарлаж, дуудагчийн signal болон 30с timeout-ийг хамтад хүндэтгэнэ.
 */
export class EidHttp implements EidRequester {
  private readonly base: string;

  constructor(
    base: string,
    private readonly secret: string,
  ) {
    this.base = base.replace(/\/+$/, '');
  }

  async request(
    method: HttpMethod,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<EidResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.secret !== '') headers.Authorization = `Bearer ${this.secret}`;

    // Дуудагчийн цуцлалт БОЛОН өөрийн timeout хоёуланг хүндэтгэнэ.
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combined,
      });
    } catch (err) {
      throw new Error(`eid: http: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Хариуны биеийг хязгаарлана — хортой/эвдэрсэн IdP хариу санах ойг барихгүй.
    const buf = Buffer.from(await res.arrayBuffer());
    const raw = buf.subarray(0, maxRespBytes).toString('utf8');
    return { raw, status: res.status };
  }

  get = (path: string, signal?: AbortSignal): Promise<EidResponse> =>
    this.request('GET', path, undefined, signal);

  post = (path: string, body?: unknown, signal?: AbortSignal): Promise<EidResponse> =>
    this.request('POST', path, body, signal);

  put = (path: string, body?: unknown, signal?: AbortSignal): Promise<EidResponse> =>
    this.request('PUT', path, body, signal);

  del = (path: string, signal?: AbortSignal): Promise<EidResponse> =>
    this.request('DELETE', path, undefined, signal);
}
