// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/audit нь hash-chained audit_log-ийн гинжийг тооцоолно.
//
// БАЙТ-НИЙЦЭЛ: canonical JSON нь Go хувилбарын `encoding/json`-ий гаралттай ЯГ
// таарах ёстой. Шалтгаан: шилжилтийн үед Go болон Node хувилбар НЭГ өгөгдлийн
// сан хуваалцаж болно — тэр үед hash өөр гарвал gene-ээс хойших гинж бүхэлдээ
// "эвдэрсэн" гэж харагдана. Иймээс энд JSON.stringify-г ШУУД хэрэглэхгүй:
//   - Go нь өгөгдмөлөөр `<`, `>`, `&`-ийг < > & болгон escape хийдэг
//     (HTML-safe), JSON.stringify хийдэггүй;
//   - Go нь map түлхүүрийг UTF-8 БАЙТААР эрэмбэлдэг, JS нь UTF-16 кодоор;
//   - occurred_at_ns нь int64 — JS Number-ийн аюулгүй хязгаараас (2^53) ХЭТЭРНЭ
//     тул BigInt-ээр яг цифрээ бичих ёстой.
//
// Тестүүд Go хувилбараас гаргасан эталон hash вектортой тулгаж шалгадаг.

import { createHash } from 'node:crypto';

/**
 * ChainEntry нь hash-chained audit_log хүснэгтэд бичигдэх нэг үйл явдлын агуулга
 * (chain hash тооцоолохоос ӨМНӨХ хэлбэр). prev_hash → chain_hash гинжээр
 * холбогддог тул дараа нь засвар хийгдсэн эсэхийг (tamper) илрүүлэх боломжтой.
 *
 * Талбаруудын ДАРААЛАЛ нь канон JSON-д тогтмол — энд талбар нэмэх нь гинж эвдэх
 * (chain-breaking) өөрчлөлт тул анхааралтай хандана.
 */
export interface ChainEntry {
  occurredAt: Date;
  actorUserId: string;
  action: string;
  category: string;
  target: string;
  requestId: string;
  /** metadata нь JSON-д хөрвөх дурын объект; null/undefined бол `null` болно. */
  metadata: Record<string, unknown> | null;
}

/**
 * goJsonString нь мөрийг Go-ийн encoding/json шиг escape хийнэ.
 *
 * Go нь өгөгдмөлөөр HTML-safe гаралт үүсгэдэг: `<`, `>`, `&` нь <, >,
 * & болно. Мөн U+2028/U+2029 (line/paragraph separator) escape хийгдэнэ.
 * ASCII биш бусад тэмдэгтийг escape ХИЙХГҮЙ (UTF-8-аар шууд бичнэ).
 */
export function goJsonString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    switch (ch) {
      case '"':
        out += '\\"';
        continue;
      case '\\':
        out += '\\\\';
        continue;
      case '\n':
        out += '\\n';
        continue;
      case '\r':
        out += '\\r';
        continue;
      case '\t':
        out += '\\t';
        continue;
      case '<':
        out += '\\u003c';
        continue;
      case '>':
        out += '\\u003e';
        continue;
      case '&':
        out += '\\u0026';
        continue;
      default:
        break;
    }
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    if (code === 0x2028 || code === 0x2029) {
      out += `\\u${code.toString(16)}`;
      continue;
    }
    out += ch;
  }
  return `${out}"`;
}

/** compareUtf8 нь хоёр мөрийг UTF-8 БАЙТААР харьцуулна (Go-ийн sort.Strings). */
function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * goJsonValue нь дурын утгыг Go-ийн encoding/json дүрмээр кодлоно:
 * map түлхүүр эрэмбэлэгдэнэ, undefined/null нь `null`, тоо/логикал нь стандарт.
 */
function goJsonValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return goJsonString(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    // Go нь бүхэл тоог бутархайгүй, бутархайг хамгийн богино хэлбэрээр бичдэг —
    // JS-ийн стандарт хөрвүүлэлт эдгээр тохиолдолд ижил гаралт өгнө.
    if (!Number.isFinite(v)) throw new Error('audit: metadata contains a non-finite number');
    return String(v);
  }
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return goJsonString(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(goJsonValue).join(',')}]`;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort(compareUtf8);
    // Go-ийн map[string]any нь undefined гэсэн утга агуулж чадахгүй тул
    // undefined-ийг null болгон кодлоно (талбарыг УНАГААХГҮЙ).
    return `{${keys.map((k) => `${goJsonString(k)}:${goJsonValue(obj[k])}`).join(',')}}`;
  }
  throw new Error(`audit: metadata contains an unsupported value type: ${typeof v}`);
}

/**
 * canonicalJson нь ChainEntry-г hash-д зориулсан ДЕТЕРМИНИСТ байт болгоно.
 * Талбарын дараалал нь Go struct-ийн дарааллаар ТОГТМОЛ.
 *
 * ЧУХАЛ — цагийн нарийвчлал: hash-д орох цагийг МИКРОСЕКУНД болгож таслана.
 * Postgres-ийн timestamptz нь µs нарийвчлалтай тул илүү нарийн үлдэгдэл
 * хадгалахад алдагдана. Таслахгүй бол Append нь нэг нарийвчлалаар hash хийж, DB
 * нь өөр нарийвчлалаар хадгалж, VerifyChain нь буцааж уншаад ӨӨР hash тооцоолох
 * тул гэмтээгүй гинж "эвдэрсэн" гэж гарна.
 *
 * JS-ийн Date нь миллисекунд нарийвчлалтай (µs-ээс бүдүүн) тул тайралт нь бодит
 * үйлдэл БИШ — гэхдээ гэрээг ил бичив: occurred_at-ыг ҮРГЭЛЖ JS-ээс параметрээр
 * дамжуулна, SQL `now()`-г ХЭРЭГЛЭХГҮЙ. Эс бөгөөс DB µs бичиж, драйвер ms-ээр
 * уншиж, hash таарахаа болино.
 */
export function canonicalJson(e: ChainEntry): Buffer {
  // Date.getTime() нь ms; ns болгоход 1e6 дахин — үр дүн нь 2^53-аас ХЭТЭРНЭ тул
  // BigInt-ээр яг цифрээ гаргана (Number бол дугуйрч байт өөр болно).
  const ns = BigInt(e.occurredAt.getTime()) * 1_000_000n;
  const parts = [
    `"occurred_at_ns":${ns.toString()}`,
    `"actor_user_id":${goJsonString(e.actorUserId)}`,
    `"action":${goJsonString(e.action)}`,
    `"category":${goJsonString(e.category)}`,
    `"target":${goJsonString(e.target)}`,
    `"request_id":${goJsonString(e.requestId)}`,
    `"metadata":${goJsonValue(e.metadata)}`,
  ];
  return Buffer.from(`{${parts.join(',')}}`, 'utf8');
}

/**
 * computeChainHash нь шинэ мөрийн chain_hash-г тооцоолно:
 *
 *   chain_hash = SHA-256( prevHash (hex текст) || canonical-json(entry) )
 *
 * prevHash нь өмнөх мөрийн chain_hash (hex мөр); genesis (анхны мөр)-д хоосон
 * мөр "" дамжуулна.
 *
 * АНХААР: prevHash-г hex МӨР хэлбэрээр (DB-д хадгалагддагтай ижил) шууд hash-д
 * оруулдаг тул verifyChain нь DB-ээс уншсан текстийг шууд дахин hash хийж чадна —
 * байт хооронд хувиргах алхам шаардлагагүй.
 */
export function computeChainHash(prevHash: string, e: ChainEntry): string {
  const h = createHash('sha256');
  h.update(Buffer.from(prevHash, 'utf8'));
  h.update(canonicalJson(e));
  return h.digest('hex');
}
