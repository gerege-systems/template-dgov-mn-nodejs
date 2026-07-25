// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/gemini нь Google Gemini API-ийн хөнгөн REST client юм — SDK
// ашиглахгүйгээр generateContent endpoint-ийг шууд дууддаг. Function
// calling-ийг бүрэн дэмжинэ: AI ямар функц дуудахаа шийдэж, backend
// (usecases/ai) гүйцэтгэдэг. Түр зуурын алдаан дээр (429/5xx/сүлжээ)
// exponential backoff-той 3 удаа дахин оролддог.
//
//   POST {base}/models/{model}:generateContent
//   Auth: x-goog-api-key: <GEMINI_API_KEY>

/**
 * ErrGeminiNotConfigured нь GEMINI_API_KEY тохируулагдаагүй үед шидэгддэг
 * sentinel — template нь Gemini-гүйгээр boot хийгдэх боломжтой хэвээр
 * (xyp client-тэй ижил загвар).
 */
export class ErrGeminiNotConfigured extends Error {
  constructor() {
    super('gemini: API key not configured (GEMINI_API_KEY)');
    this.name = 'ErrGeminiNotConfigured';
  }
}

const defaultBase = 'https://generativelanguage.googleapis.com/v1beta';
const defaultModel = 'gemini-2.5-flash';

/**
 * maxRespBytes нь хариуг санах ойд буулгах дээд хэмжээ. TTS/Speak-ийн хариу
 * нь base64 PCM аудиог JSON дотор шигтгэдэг тул урт текст (≤2000 тэмдэгт) хэдэн
 * MiB болно; 4 MiB хэт бага байсан тул body таслагдаж, JSON задлалт унаж 500
 * өгдөг байв. 32 MiB нь хамгийн урт TTS-ийг ч багтаана (текст чат хэвийн бага).
 */
const maxRespBytes = 32 << 20;

/**
 * maxAttempts = 1 анхны оролдлого + 2 дахин оролдлого. Backoff нь
 * initialBackoff * 2^attempt (500ms → 1s).
 */
const maxAttempts = 3;
const initialBackoffMs = 500;
const httpTimeoutMs = 60_000;

// ── Gemini REST wire төрлүүд (зөвхөн ашигладаг талбарууд) ──────────────

/** Blob нь inline media — data нь base64 байт, mimeType нь "audio/webm" гэх мэт. */
export interface Blob {
  mimeType: string;
  data: string;
}

/** FunctionCall нь model-ийн "энэ функцийг эдгээр аргументаар дууд" гэсэн шийдвэр. */
export interface FunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

/** FunctionResponse нь backend дээр гүйцэтгэсэн функцийн үр дүнг model руу буцаах хэлбэр. */
export interface FunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

/**
 * Part нь Content доторх нэг хэсэг — текст, function дуудлага (model-ээс),
 * function-ий үр дүн (backend-ээс буцааж өгдөг), эсвэл inline media (audio
 * оролт / TTS гаралт) гэсэн төрлүүдийн нэг.
 */
export interface Part {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  inlineData?: Blob;
}

/** Content нь нэг ээлжийн (turn) агуулга. role: "user" | "model". */
export interface Content {
  role?: string;
  parts: Part[];
}

/**
 * FunctionDeclaration нь model-д зарлах функцийн тодорхойлолт. parameters нь
 * OpenAPI/JSON Schema хэлбэртэй объект (хатуу төрөл шаардахгүй — дуудагч өөрөө
 * зарладаг).
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** Tool нь function calling-д зарлагдах функцуудын багц. */
export interface Tool {
  functionDeclarations: FunctionDeclaration[];
}

export interface PrebuiltVoiceConfig {
  voiceName: string;
}

export interface VoiceConfig {
  prebuiltVoiceConfig?: PrebuiltVoiceConfig;
}

/** SpeechConfig нь TTS дуу хоолойн сонголт. */
export interface SpeechConfig {
  voiceConfig?: VoiceConfig;
}

/**
 * GenerationConfig нь generation-ий сонголттой тохиргоо. responseModalities
 * + speechConfig нь TTS model-уудад ("AUDIO" modality) хэрэглэгдэнэ.
 */
export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseModalities?: string[];
  speechConfig?: SpeechConfig;
}

/** GeminiRequest нь generateContent хүсэлтийн body. */
export interface GeminiRequest {
  systemInstruction?: Content;
  contents: Content[];
  tools?: Tool[];
  generationConfig?: GenerationConfig;
}

/** Candidate нь model-ийн нэг хариулт. */
export interface Candidate {
  content?: Content;
  finishReason?: string;
}

/** GeminiResponse нь generateContent хариу. */
export interface GeminiResponse {
  candidates?: Candidate[];
}

/** responseText нь эхний candidate-ийн бүх текст хэсгийг нэгтгэж буцаана. */
export function responseText(r: GeminiResponse): string {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}

/**
 * responseFunctionCalls нь эхний candidate-ийн бүх function дуудлагыг
 * буцаана — хоосон бол model текстээр хариулсан гэсэн үг.
 */
export function responseFunctionCalls(r: GeminiResponse): FunctionCall[] {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const calls: FunctionCall[] = [];
  for (const p of parts) {
    if (p.functionCall) calls.push(p.functionCall);
  }
  return calls;
}

/**
 * responseInlineAudio нь эхний candidate-ийн эхний audio inlineData-г
 * буцаана (TTS гаралт) — байхгүй бол null.
 */
export function responseInlineAudio(r: GeminiResponse): Blob | null {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData && p.inlineData.mimeType.startsWith('audio/')) return p.inlineData;
  }
  return null;
}

/**
 * responseModelContent нь эхний candidate-ийн content-ийг буцаана — function
 * calling давталтад model-ийн ээлжийг conversation руу буцааж нэмэхэд хэрэглэнэ.
 */
export function responseModelContent(r: GeminiResponse): Content {
  const c = r.candidates?.[0]?.content;
  if (!c) return { role: 'model', parts: [] };
  return { ...c, role: c.role === undefined || c.role === '' ? 'model' : c.role };
}

/** Generator нь Gemini дуудлагын хийсвэрлэл — тестэд хуурамчаар тавихад хялбар. */
export interface Generator {
  generateContent(req: GeminiRequest, signal?: AbortSignal): Promise<GeminiResponse>;
}

/** snippet нь алдааны body-г log-д аюулгүй хэмжээнд тайрна. */
function snippet(raw: string): string {
  const s = raw.trim();
  return s.length > 200 ? s.slice(0, 200) : s;
}

/** RetryableError нь дахин оролдох утгатай алдааг тэмдэглэнэ. */
class RetryableError extends Error {
  readonly retryable = true;
}

class GeminiClient implements Generator {
  private readonly base: string;
  private readonly model: string;

  constructor(
    base: string,
    private readonly apiKey: string,
    model: string,
    /** sleep-ийг тестэд override хийнэ (бодит backoff хүлээхгүйн тулд). */
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void> = sleepCtx,
  ) {
    this.base = (base === '' ? defaultBase : base).replace(/\/+$/, '');
    this.model = model === '' ? defaultModel : model;
  }

  /**
   * generateContent нь generateContent-ийг дуудаж, түр зуурын алдаан дээр
   * (сүлжээ / 429 / 5xx) exponential backoff-той дахин оролдоно. Бүх оролдлого
   * амжилтгүй бол сүүлчийн алдааг шиднэ — fallback мессежийг дуудагч
   * (usecase) шийднэ.
   */
  async generateContent(req: GeminiRequest, signal?: AbortSignal): Promise<GeminiResponse> {
    if (this.apiKey === '') throw new ErrGeminiNotConfigured();

    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        try {
          await this.sleep(initialBackoffMs << (attempt - 1), signal);
        } catch (err) {
          throw new Error(`gemini: retry wait: ${errText(err)}`);
        }
      }
      try {
        return await this.generateOnce(req, signal);
      } catch (err) {
        lastErr = err;
        if (!(err instanceof RetryableError)) throw err;
      }
    }
    throw new Error(`gemini: ${String(maxAttempts)} attempts failed: ${errText(lastErr)}`);
  }

  /** generateOnce нь нэг HTTP оролдлого хийнэ. */
  private async generateOnce(req: GeminiRequest, signal?: AbortSignal): Promise<GeminiResponse> {
    const url = `${this.base}/models/${this.model}:generateContent`;
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(req),
        signal: combined,
      });
    } catch (err) {
      // Дуудагчийн контекст цуцлагдсан бол дахин оролдоод нэмэргүй.
      if (signal?.aborted === true) throw new Error(`gemini: http: ${errText(err)}`);
      throw new RetryableError(`gemini: http: ${errText(err)}`);
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      // Body-ийн уншилт тасарсан (сүлжээний түр саатал). Контекст амьд бол түр
      // зуурын гэж үзэж дахин оролдоно — эс бөгөөс хэсэгчилсэн JSON нь
      // бус-retryable алдаа болж, retry хийвэл амжилттай болох байсныг 500 болгодог.
      if (signal?.aborted === true) throw new Error(`gemini: read body: ${errText(err)}`);
      throw new RetryableError(`gemini: read body: ${errText(err)}`);
    }
    const raw = buf.subarray(0, maxRespBytes).toString('utf8');

    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`gemini: status ${String(res.status)}: ${snippet(raw)}`);
    }
    if (res.status >= 300) {
      // Бусад 4xx (буруу хүсэлт, эрхгүй түлхүүр) — дахин оролдоод нэмэргүй.
      throw new Error(`gemini: status ${String(res.status)}: ${snippet(raw)}`);
    }

    // Хариу cap-д хүрсэн бол таслагдсан байж болзошгүй — дахин оролдвол мөн адил
    // таслагдах тул тодорхой алдаа шиднэ (JSON задлалтын төөрөгдөлтэй алдааг биш).
    if (buf.length >= maxRespBytes) {
      throw new Error(
        `gemini: response exceeded ${String(maxRespBytes)} bytes (likely truncated audio/text)`,
      );
    }

    try {
      return JSON.parse(raw) as GeminiResponse;
    } catch (err) {
      throw new Error(`gemini: decode response: ${errText(err)}`);
    }
  }
}

/** errText нь unknown алдааг мессеж болгоно. */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** sleepCtx нь цуцлалтыг хүндэтгэдэг sleep. */
function sleepCtx(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new Error('gemini: context canceled'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('gemini: context canceled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * newGeminiClient нь Gemini client үүсгэнэ. base/model хоосон бол өгөгдмөл
 * утга авна. apiKey хоосон бол generateContent нь ErrGeminiNotConfigured шиднэ.
 */
export const newGeminiClient = (
  base: string,
  apiKey: string,
  model: string,
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>,
): Generator => new GeminiClient(base, apiKey, model, sleep);
