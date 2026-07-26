// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/verify нь GeregeCloud Verify API (verify.gecloud.mn)-ийн client юм. Энэ
// алсын үйлчилгээ OTP-ийг ӨӨРӨӨ үүсгэж, hash-аар хадгалж, имэйл/SMS-ээр
// илгээж, brute-force-ыг өөрөө хязгаарладаг. Иймд template нь дотоодын код
// generator / SMTP mailer-ийн оронд зөвхөн request_id-ийн амьдрах хугацааг л
// (Redis-д) хянана.
//
//   POST /verify/send   {to, channel}       → {request_id}
//   POST /verify/check  {request_id, code}  → {status: "approved"}
//   Auth: X-API-Key: gck_live_…

/**
 * ErrNotApproved нь /verify/check код буруу/хугацаа дууссан үед шидэгддэг
 * sentinel. Дуудагч үүнийг "буруу OTP" (4xx) гэж тайлбарлана; бусад алдаа нь
 * дотоод/сүлжээний асуудал (5xx).
 */
export class ErrNotApproved extends Error {
  constructor() {
    super('verify: code not approved');
    this.name = 'ErrNotApproved';
  }
}

const defaultBase = 'https://verify.gecloud.mn/v1';
const defaultChannel = 'email';
const maxRespBytes = 64 << 10;
const httpTimeoutMs = 15_000;

/** VerifySender нь OTP илгээх/шалгах хийсвэрлэл — тестэд fake тавихад хялбар. */
export interface VerifySender {
  /**
   * send нь OTP-ийг `to` (имэйл/утас) руу channel-аар илгээж request_id
   * буцаана. channel хоосон бол client-ийн өгөгдмөл.
   */
  send(to: string, channel: string, signal?: AbortSignal): Promise<string>;
  /**
   * check нь request_id + code-г баталгаажуулна. Зөвшөөрөгдсөн бол амжилттай,
   * буруу/хугацаа дууссан бол ErrNotApproved шиднэ.
   */
  check(requestId: string, code: string, signal?: AbortSignal): Promise<void>;
}

const snippet = (s: string): string => (s.length > 200 ? s.slice(0, 200) : s.trim());

class VerifyClient implements VerifySender {
  private readonly base: string;
  private readonly channel: string;

  constructor(
    base: string,
    private readonly apiKey: string,
    channel: string,
  ) {
    this.base = (base === '' ? defaultBase : base).replace(/\/+$/, '');
    this.channel = channel === '' ? defaultChannel : channel;
  }

  async send(to: string, channel: string, signal?: AbortSignal): Promise<string> {
    // Тохируулаагүй бол дуудагч дотоод алдаа болгож харуулна (boot зогсохгүй).
    if (this.apiKey === '') throw new Error('verify: API key not configured (VERIFY_API_KEY)');
    const { raw, status } = await this.post(
      '/verify/send',
      { to, channel: channel === '' ? this.channel : channel },
      signal,
    );
    if (status >= 300) throw new Error(`verify send: status ${String(status)}: ${snippet(raw)}`);
    let out: { request_id?: string };
    try {
      out = JSON.parse(raw) as { request_id?: string };
    } catch {
      throw new Error(`verify send: empty/invalid request_id: ${snippet(raw)}`);
    }
    if (!out.request_id) throw new Error(`verify send: empty request_id: ${snippet(raw)}`);
    return out.request_id;
  }

  async check(requestId: string, code: string, signal?: AbortSignal): Promise<void> {
    if (this.apiKey === '') throw new Error('verify: API key not configured (VERIFY_API_KEY)');
    const { raw, status } = await this.post(
      '/verify/check',
      { request_id: requestId, code },
      signal,
    );
    // Сервер талын алдаа (5xx) нь ДОТООД асуудал — дахин оролдохыг зөвшөөрнө.
    if (status >= 500) throw new Error(`verify check: status ${String(status)}: ${snippet(raw)}`);
    let out: { status?: string } = {};
    try {
      out = JSON.parse(raw) as { status?: string };
    } catch {
      // JSON биш хариу — доорх шалгалт нь ErrNotApproved болгоно.
    }
    if (status < 300 && out.status === 'approved') return;
    // 2xx-non-approved эсвэл 4xx (буруу/хугацаа дууссан код).
    throw new ErrNotApproved();
  }

  private async post(
    path: string,
    body: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{ raw: string; status: number }> {
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: combined,
      });
    } catch (err) {
      throw new Error(`verify: http: ${err instanceof Error ? err.message : String(err)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { raw: buf.subarray(0, maxRespBytes).toString('utf8'), status: res.status };
  }
}

/**
 * newVerifyClient нь Verify client үүсгэнэ. base/channel хоосон бол өгөгдмөл;
 * apiKey хоосон бол send/check нь "тохируулаагүй" алдаа шиднэ (template нь
 * gecloud-гүйгээр boot хийгдэх боломжтой хэвээр).
 */
export const newVerifyClient = (base: string, apiKey: string, channel: string): VerifySender =>
  new VerifyClient(base, apiKey, channel);
