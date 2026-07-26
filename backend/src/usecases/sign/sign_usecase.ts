// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// PDF гарын үсэг (PAdES) eidmongolia /v3-ээр. Хувь хүн, эсвэл төлөөлж чадах
// байгууллагынхаа нэрийн өмнөөс (onBehalfOf).
//
// Урсгал: иргэн PDF оруулна → серверт hash тооцоод /v3 signature/notification/
// etsi-д digest илгээж утсанд PIN2 push явуулна → иргэн утсан дээрээ зөвшөөрнө
// (энэ нь ХУУЛЬ ЗҮЙН зөвшөөрөл) → сервер /v3 session-ийг poll хийж
// баталгаажуулна → татах үед eidmongolia-ийн албан ёсны stamp (PAdES-T + verify
// хуудас), эс бөгөөс СЕРВЕРИЙН Document-Signer-ээр PDF дотор PAdES гарын үсэг
// шигтгэнэ.
//
// Байгууллагын нэрийн өмнөөс (NTRMN-<РД>): гарын үсэг өөрөө ИРГЭНИЙ PIN2
// сертификатаар зурагдана (тамга биш), гэхдээ eidmongolia session-д тухайн
// байгууллагыг уяж, төлөөллийн эрхийг ШАЛГАНА (эрхгүй бол 403).

import { createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import forge from 'node-forge';
import {
  badRequest,
  forbidden,
  internalCause,
  notFound,
  unauthorized,
} from '../../apperror/index.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';
import {
  buildSignerFromPem,
  embedPAdES,
  normalizePdf,
  overlayImageLastPage,
} from '../../pkg/pdf/pdf.js';
import type { SignerIdentity } from '../../pkg/pdf/pdf.js';

/** Cache нь sign session-ийн төлвийг (init↔poll↔download) зөөх нарийн гэрээ. */
export interface SignCache {
  set(ctx: Ctx, key: string, value: string): Promise<void>;
  get(ctx: Ctx, key: string): Promise<string | null>;
}

/** SignConfig нь /v3 RP тохиргоо. */
export interface SignConfig {
  /** v3BaseUrl нь eidmongolia-ийн суурь хаяг. */
  v3BaseUrl: string;
  rpUuid: string;
  rpName: string;
  /** apiSecret хоосон бол Authorization header илгээхгүй. */
  apiSecret: string;
  /**
   * signerCertPem / signerKeyPem нь серверийн БАЙНГЫН Document-Signer.
   * Хоосон үед: production-д алдаа (fail-closed), development-д гарын үсэг
   * шигтгэх боломжгүй болно (v3 stamp хэвээр ажиллана).
   */
  signerCertPem: string;
  signerKeyPem: string;
  isProduction: boolean;
}

export interface InitResult {
  session_id: string;
  document_hash: string;
  verification_code: string;
  filename: string;
}

export interface DownloadResult {
  pdf: Buffer;
  filename: string;
}

export interface SignUsecase {
  /**
   * init нь PDF-ийн hash тооцоод /v3 PIN2 гарын үсгийн session эхлүүлж, төлвийг
   * cache-д хадгална. onBehalfOfOrg (NTRMN-<РД>) өгвөл байгууллагын нэрийн
   * өмнөөс — төлөөллийн эрхгүй бол 403.
   */
  init(
    ctx: Ctx,
    input: {
      regNo: string;
      fullName: string;
      filename: string;
      pdf: Buffer;
      onBehalfOfOrg: string;
      signatureUrl: string;
      stampUrl: string;
    },
  ): Promise<InitResult>;
  /** poll нь /v3 session-ийг шалгаж төлвийг шинэчилнэ. */
  poll(ctx: Ctx, ownerRegNo: string, sessionId: string): Promise<string>;
  /** download нь дууссан session-ий PDF-д гарын үсэг шигтгэж буцаана. */
  download(ctx: Ctx, ownerRegNo: string, sessionId: string): Promise<DownloadResult>;
}

/** signState нь cache-д хадгалагдах session төлөв. */
interface SignState {
  reg_no: string;
  full_name: string;
  filename: string;
  pdf_b64: string;
  doc_hash_b64: string;
  v3_session_id: string;
  /** state: running | completed | failed | expired | rejected */
  state: string;
  signer_name: string;
  signer_serial: string;
  completed_at: string;
  on_behalf_of_org: string;
  /** on_behalf_of_org_name нь eidmongolia-аас ирсэн БАТАЛГААЖСАН нэр. */
  on_behalf_of_org_name: string;
}

const statePrefix = 'pdfsign:';
const maxPdfBytes = 25 << 20;
const maxAssetBytes = 6 << 20;
const httpTimeoutMs = 15_000;

/** toEtsi нь регистр/иргэний дугаараас ETSI semantic id гаргана. */
export function toEtsi(id: string): string {
  const v = id.trim().toUpperCase();
  if (v.startsWith('PNOMN-') || v.startsWith('NTRMN-')) return v;
  return `PNOMN-${v}`;
}

/**
 * regNoMatches нь буцсан сертификатын serialNumber дахь РД нь session эзний
 * reg_no-той тохирч буйг шалгана. Зөвхөн ОРОН ТООны цөмийг тулгана; certSerial-д
 * орон байхгүй бол (шалгах боломжгүй) үнэн буцаана — eID session-ийн өөрийн
 * уялт хүчинтэй хэвээр тул хууль ёсны урсгалыг эвдэхгүй.
 */
export function regNoMatches(certSerial: string, regNo: string): boolean {
  const digits = (s: string): string => s.replace(/\D/g, '');
  const cd = digits(certSerial);
  if (cd === '') return true;
  return cd === digits(regNo);
}

/** isDisallowedFetchIp нь дотоод/тусгай зориулалтын IP мужуудыг хориглоно. */
export function isDisallowedFetchIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 0) return true;
  if (v === 4) {
    const p = ip.split('.').map(Number);
    const [a = 0, b = 0] = p;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:10.0.0.1) — доторх IPv4-ээр шалгана.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return isDisallowedFetchIp(mapped[1]);
  return false;
}

interface V3PollResult {
  state: string;
  endResult: string;
  subjectName: string;
  subjectSerial: string;
  orgName: string;
}

class SignUsecaseImpl implements SignUsecase {
  constructor(
    private readonly cache: SignCache,
    private readonly cfg: SignConfig,
    /** signer нь null байж болно (dev, тохируулаагүй) — v3 stamp хэвээр ажиллана. */
    private readonly signer: SignerIdentity | null,
  ) {}

  // ── Session төлөв ───────────────────────────────────────────────────

  private async saveState(ctx: Ctx, id: string, st: SignState): Promise<void> {
    await this.cache.set(ctx, statePrefix + id, JSON.stringify(st));
  }

  private async loadState(ctx: Ctx, id: string): Promise<SignState> {
    const raw = await this.cache.get(ctx, statePrefix + id);
    if (raw === null || raw === '') throw notFound('sign session олдсонгүй');
    try {
      return JSON.parse(raw) as SignState;
    } catch {
      throw notFound('sign session олдсонгүй');
    }
  }

  // ── Init ────────────────────────────────────────────────────────────

  async init(
    ctx: Ctx,
    input: {
      regNo: string;
      fullName: string;
      filename: string;
      pdf: Buffer;
      onBehalfOfOrg: string;
      signatureUrl: string;
      stampUrl: string;
    },
  ): Promise<InitResult> {
    if (input.pdf.length === 0 || input.pdf.length > maxPdfBytes) {
      throw badRequest('PDF хэмжээ буруу (1 байт–25 MB)');
    }
    if (input.regNo.trim() === '') throw unauthorized('регистр тодорхойгүй');
    const onBehalfOfOrg = input.onBehalfOfOrg.trim().toUpperCase();

    // Визуал гарын үсэг + тамгыг эх PDF-д давхарлана — hash тооцохоос ӨМНӨ,
    // ингэснээр гарын үсэглэсэн агуулгын нэг хэсэг болно. Best-effort.
    const pdf = await this.applyVisualAssets(ctx, input.pdf, input.signatureUrl, input.stampUrl);
    const digestB64 = createHash('sha256').update(pdf).digest('base64');

    const started = await this.startV3Sign(
      ctx,
      toEtsi(input.regNo),
      digestB64,
      input.fullName,
      onBehalfOfOrg,
    );

    const sessionId = randomBytes(16).toString('hex');
    await this.saveState(ctx, sessionId, {
      reg_no: input.regNo,
      full_name: input.fullName,
      filename: input.filename,
      pdf_b64: pdf.toString('base64'),
      doc_hash_b64: digestB64,
      v3_session_id: started.sessionId,
      state: 'running',
      signer_name: '',
      signer_serial: '',
      completed_at: '',
      on_behalf_of_org: onBehalfOfOrg,
      on_behalf_of_org_name: '',
    }).catch((err: unknown) => {
      throw internalCause(new Error(`sign state store: ${logger.errText(err)}`));
    });

    return {
      session_id: sessionId,
      document_hash: digestB64,
      verification_code: started.vc,
      filename: input.filename,
    };
  }

  /**
   * applyVisualAssets нь тамга (байгууллагын нэрийн өмнөөс) болон гарын үсгийг
   * сүүлчийн хуудасны баруун доод буланд давхарлана. Best-effort: татах/давхарлах
   * алдаа гарвал тухайн зургийг АЛГАСНА — гарын үсэг зогсохгүй.
   */
  private async applyVisualAssets(
    ctx: Ctx,
    pdf: Buffer,
    signatureUrl: string,
    stampUrl: string,
  ): Promise<Buffer> {
    // Хэвийшүүлэлт: PAdES шигтгэгч xref STREAM-тэй PDF-ийг уншдаггүй тул
    // сонгодог xref хүснэгт рүү нэг удаа бичнэ — иргэний баталгаажуулах digest
    // ЭНЭ байтуудаас тооцогдоно (өөрчлөгдсөн файл дээр гарын үсэг зурагдахгүй).
    let out = pdf;
    try {
      out = await normalizePdf(pdf);
    } catch (err) {
      logger.warnWithContext(ctx, 'sign: PDF хэвийшүүлэх алдаа (эх хэвээр)', {
        usecase: 'sign',
        error: logger.errText(err),
      });
    }
    // Тамга — гарын үсгийн зүүн талд, арай том.
    const stamp = await this.fetchAssetImage(ctx, stampUrl);
    if (stamp) {
      try {
        out = await overlayImageLastPage(out, stamp, { scale: 0.2, offsetX: 170, offsetY: 30 });
      } catch (err) {
        logger.warnWithContext(ctx, 'sign: тамга давхарлах алдаа (алгасав)', {
          usecase: 'sign',
          error: logger.errText(err),
        });
      }
    }
    // Гарын үсэг — баруун доод булан.
    const signature = await this.fetchAssetImage(ctx, signatureUrl);
    if (signature) {
      try {
        out = await overlayImageLastPage(out, signature, {
          scale: 0.15,
          offsetX: 30,
          offsetY: 30,
        });
      } catch (err) {
        logger.warnWithContext(ctx, 'sign: гарын үсэг давхарлах алдаа (алгасав)', {
          usecase: 'sign',
          error: logger.errText(err),
        });
      }
    }
    return out;
  }

  /**
   * fetchAssetImage нь тамга/гарын үсгийн зургийг URL-ээс татна.
   *
   * SSRF хамгаалалт: зөвхөн https; хостыг ӨМНӨӨС нь шийдэж (DNS) дотоод/loopback/
   * link-local хаяг руу заасан бол татахгүй; redirect ДАГАХГҮЙ (дотоод хаяг руу
   * үсрэхээс сэргийлнэ); 6 MiB-ээр таслана.
   */
  private async fetchAssetImage(ctx: Ctx, rawUrl: string): Promise<Buffer | null> {
    const imgUrl = rawUrl.trim();
    if (imgUrl === '') return null;

    let parsed: URL;
    try {
      parsed = new URL(imgUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname === '') {
      logger.warnWithContext(ctx, 'sign: зургийн URL зөвшөөрөгдөөгүй схем (алгасав)', {
        usecase: 'sign',
      });
      return null;
    }

    // Хостын бодит IP-г шалгана (DNS rebinding-ийн эсрэг эхний хамгаалалт).
    try {
      const host = parsed.hostname.replace(/^\[|\]$/g, '');
      const addrs = isIP(host) !== 0 ? [{ address: host }] : await lookup(host, { all: true });
      if (addrs.length === 0 || addrs.some((a) => isDisallowedFetchIp(a.address))) {
        logger.warnWithContext(ctx, 'sign: зургийн хаяг дотоод сүлжээ рүү заасан (алгасав)', {
          usecase: 'sign',
        });
        return null;
      }
    } catch {
      return null;
    }

    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
    try {
      const res = await fetch(imgUrl, { redirect: 'manual', signal });
      if (res.status >= 300) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > maxAssetBytes) return null;
      return buf;
    } catch {
      return null;
    }
  }

  // ── Poll ────────────────────────────────────────────────────────────

  async poll(ctx: Ctx, ownerRegNo: string, sessionId: string): Promise<string> {
    const st = await this.loadState(ctx, sessionId);
    // Эзэмшил: зөвхөн session-ийг эхлүүлсэн иргэн хандана (IDOR хаалт).
    // "Байхгүй" ба "чинийх биш" нь ИЖИЛ 404.
    if (st.reg_no !== ownerRegNo) throw notFound('sign session олдсонгүй');
    if (st.state !== 'running') return st.state;

    let res: V3PollResult;
    try {
      res = await this.pollV3(ctx, st.v3_session_id);
    } catch {
      return 'running'; // түр зуурын — дахин poll
    }

    if (res.state === 'COMPLETE' && res.endResult === 'OK') {
      // /v3 session нь toEtsi(reg_no)-оор эхэлсэн тул eID өөрөө буцах
      // сертификатыг тэр иргэнд уяна. Нэмэлт cross-check нь зарим cert-ийн
      // serialNumber формат дээр ХУДАЛ бүтэлгүйтэл өгдөг тул БЛОКЛОХГҮЙ.
      if (!regNoMatches(res.subjectSerial, st.reg_no)) {
        logger.warnWithContext(ctx, 'sign: cert serial РД-тэй тоон таарахгүй (non-blocking)', {
          usecase: 'sign',
          method: 'poll',
          cert_serial: res.subjectSerial,
          has_regno: st.reg_no !== '',
        });
      }
      st.state = 'completed';
      st.signer_name = res.subjectName;
      st.signer_serial = res.subjectSerial;
      st.completed_at = new Date().toISOString();
      // Байгууллагын нэрийн өмнөөс байсан бол eidmongolia-гийн БАТАЛГААЖСАН
      // нэрийг (client-ийнхийг БИШ) хадгална.
      if (res.orgName !== '') st.on_behalf_of_org_name = res.orgName;
    } else if (res.state === 'COMPLETE' && res.endResult === 'USER_REFUSED') {
      st.state = 'rejected';
    } else if (res.state === 'COMPLETE') {
      logger.warnWithContext(ctx, 'sign: COMPLETE-ийн endResult OK/USER_REFUSED биш', {
        usecase: 'sign',
        method: 'poll',
        end_result: res.endResult,
      });
      st.state = 'failed';
    } else {
      return 'running';
    }

    await this.saveState(ctx, sessionId, st).catch(() => undefined);
    return st.state;
  }

  // ── Download ────────────────────────────────────────────────────────

  async download(ctx: Ctx, ownerRegNo: string, sessionId: string): Promise<DownloadResult> {
    const st = await this.loadState(ctx, sessionId);
    if (st.reg_no !== ownerRegNo) throw notFound('sign session олдсонгүй');
    if (st.state !== 'completed') throw badRequest('гарын үсэг дуусаагүй');

    const pdf = Buffer.from(st.pdf_b64, 'base64');
    if (pdf.length === 0) throw internalCause(new Error('sign: pdf decode'));

    // eidmongolia-ийн албан ёсны PAdES-T stamp (RFC 3161 timestamp + verify
    // хуудас). Амжилтгүй бол серверийн Document-Signer-ээр буулгана.
    let signed: Buffer;
    try {
      signed = await this.stampV3(ctx, st.v3_session_id, st.filename, pdf);
    } catch (err) {
      logger.warnWithContext(ctx, 'sign: v3 stamp амжилтгүй — self-embed fallback', {
        usecase: 'sign',
        method: 'download',
        error: logger.errText(err),
      });
      signed = await this.selfEmbed(pdf, st);
    }

    const base = st.filename.replace(/\.pdf$/i, '');
    return { pdf: signed, filename: `${base}-signed.pdf` };
  }

  /**
   * selfEmbed нь серверийн Document-Signer-ээр PDF-д гарын үсгийн dictionary
   * шигтгэнэ. Гарын үсгийн шалтгаанд иргэний РД, байгууллагын нэрийн өмнөөс
   * байсан бол "…-ийн нэрийн өмнөөс" гэж тусгана.
   */
  private async selfEmbed(pdf: Buffer, st: SignState): Promise<Buffer> {
    const signer = this.signer;
    if (!signer) {
      throw internalCause(
        new Error('sign: Document-Signer тохируулаагүй (SIGN_SIGNER_CERT_FILE/KEY_FILE)'),
      );
    }
    const name = st.signer_name === '' ? st.full_name : st.signer_name;
    let reason = `eID PIN2 гарын үсэг — РД ${st.reg_no}`;
    if (st.on_behalf_of_org_name !== '') {
      reason += ` · ${st.on_behalf_of_org_name}-ийн нэрийн өмнөөс`;
    } else if (st.on_behalf_of_org !== '') {
      reason += ` · ${st.on_behalf_of_org}-ийн нэрийн өмнөөс`;
    }
    try {
      return await embedPAdES(pdf, signer, { name, reason });
    } catch (err) {
      throw internalCause(new Error(`pades embed: ${logger.errText(err)}`));
    }
  }

  // ── eidmongolia /v3 client ──────────────────────────────────────────

  /** authHeaders нь RP secret тохируулсан бол Bearer нэмнэ. */
  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    if (this.cfg.apiSecret === '') return extra;
    return { ...extra, Authorization: `Bearer ${this.cfg.apiSecret}` };
  }

  private base(): string {
    return this.cfg.v3BaseUrl.replace(/\/+$/, '');
  }

  private signal(ctx: Ctx): AbortSignal {
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    return ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  }

  private async startV3Sign(
    ctx: Ctx,
    etsi: string,
    digestB64: string,
    displayName: string,
    onBehalfOfOrg: string,
  ): Promise<{ sessionId: string; vc: string }> {
    const body: Record<string, unknown> = {
      relyingPartyUUID: this.cfg.rpUuid,
      relyingPartyName: this.cfg.rpName,
      certificateLevel: 'QUALIFIED',
      signatureProtocol: 'ACSP_V2',
      digest: digestB64,
      hashType: 'SHA256',
      interactions: [{ type: 'displayTextAndPIN', displayText60: 'Gerege — баримтад гарын үсэг' }],
    };
    // onBehalfOf (NTRMN-<РД>) — сервер төлөөллийн эрхийг session үүсэх үед
    // шалгаж, эрхгүй бол 403 буцаана.
    if (onBehalfOfOrg !== '') body.onBehalfOf = onBehalfOfOrg;

    const url = `${this.base()}/v3/signature/notification/etsi/${encodeURIComponent(etsi)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: this.signal(ctx),
      });
    } catch (err) {
      throw internalCause(new Error(`v3 sign start: ${logger.errText(err)}`));
    }

    // 403 = иргэн тухайн байгууллагыг төлөөлөх эрхгүй (эсвэл RP-д SIGN эрх алга)
    // — хэрэглэгчид ойлгомжтой Forbidden болгож ил гаргана (5xx болгож нуухгүй).
    if (res.status === 403) throw forbidden('энэ байгууллагыг төлөөлөх эрхгүй байна');
    if (res.status >= 300) {
      const text = (await res.text()).slice(0, 200);
      throw internalCause(new Error(`v3 sign start: ${String(res.status)}: ${text}`));
    }

    let parsed: { sessionID?: string; vc?: { value?: string } };
    try {
      parsed = (await res.json()) as { sessionID?: string; vc?: { value?: string } };
    } catch (err) {
      throw internalCause(new Error(`v3 sign start decode: ${logger.errText(err)}`));
    }
    // displayName нь /v3-д interactions-аар дамждаг тул энд ашиглагдахгүй —
    // гэхдээ дуудагчийн гэрээг хадгална (лог/ирээдүйн push текстэд).
    void displayName;
    return { sessionId: parsed.sessionID ?? '', vc: parsed.vc?.value ?? '' };
  }

  private async pollV3(ctx: Ctx, v3SessionId: string): Promise<V3PollResult> {
    const url = `${this.base()}/v3/session/${encodeURIComponent(v3SessionId)}?timeoutMs=1000`;
    const res = await fetch(url, { headers: this.authHeaders(), signal: this.signal(ctx) });
    if (res.status >= 300) throw new Error(`v3 poll ${String(res.status)}`);
    const r = (await res.json()) as {
      state?: string;
      result?: { endResult?: string };
      cert?: { value?: string };
      onBehalfOf?: { orgEtsi?: string; orgName?: string };
    };
    const out: V3PollResult = {
      state: r.state ?? '',
      endResult: r.result?.endResult ?? '',
      subjectName: '',
      subjectSerial: '',
      orgName: r.onBehalfOf?.orgName ?? '',
    };
    if (r.cert?.value) {
      const subject = parseCertSubject(r.cert.value);
      out.subjectName = subject.commonName;
      out.subjectSerial = subject.serialNumber;
    }
    return out;
  }

  /**
   * stampV3 нь дууссан /v3 session-ий эх PDF-ийг eidmongolia-д stamp хийлгэж,
   * албан ёсны PAdES-T (timestamp + verify хуудас) шингээсэн PDF-ийг буцаана.
   */
  private async stampV3(
    ctx: Ctx,
    v3SessionId: string,
    filename: string,
    pdf: Buffer,
  ): Promise<Buffer> {
    if (v3SessionId === '') throw new Error('v3 session id хоосон');
    const url = `${this.base()}/v3/signature/stamp/${encodeURIComponent(v3SessionId)}?fileName=${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/pdf' }),
      body: new Uint8Array(pdf),
      signal: this.signal(ctx),
    });
    if (res.status >= 300) {
      const text = (await res.text()).slice(0, 512);
      throw new Error(`v3 stamp ${String(res.status)}: ${text}`);
    }
    const signed = Buffer.from(await res.arrayBuffer());
    if (signed.length === 0) throw new Error('v3 stamp хоосон PDF буцаав');
    return signed;
  }
}

/**
 * parseCertSubject нь base64 DER сертификатаас CN болон serialNumber-ыг
 * гаргана. node-forge-ээр задалдаг; амжилтгүй бол хоосон (poll-ыг унагахгүй).
 */
function parseCertSubject(certB64: string): { commonName: string; serialNumber: string } {
  try {
    const der = forge.util.decode64(certB64);
    const asn1 = forge.asn1.fromDer(der);
    const cert = forge.pki.certificateFromAsn1(asn1);
    const cn = cert.subject.getField('CN') as { value?: string } | null;
    const sn = cert.subject.getField('serialNumber') as { value?: string } | null;
    return { commonName: (cn?.value ?? '').trim(), serialNumber: sn?.value ?? '' };
  } catch {
    return { commonName: '', serialNumber: '' };
  }
}

/**
 * newSignUsecase нь sign usecase үүсгэнэ. Document-Signer-ийн PEM хос хоосон
 * бол production-д алдаа шиднэ (fail-closed): эфемер self-signed түлхүүр нь
 * reproducible/verifiable/revocable БУС тул production-д хориотой.
 */
export function newSignUsecase(cache: SignCache, cfg: SignConfig): SignUsecase {
  let signer: SignerIdentity | null = null;
  if (cfg.signerCertPem !== '' && cfg.signerKeyPem !== '') {
    signer = buildSignerFromPem(cfg.signerCertPem, cfg.signerKeyPem);
  } else if (cfg.isProduction) {
    throw new Error(
      'sign: production-д байнгын Document-Signer ЗААВАЛ — SIGN_SIGNER_CERT_FILE ба SIGN_SIGNER_KEY_FILE тохируул',
    );
  }
  return new SignUsecaseImpl(cache, cfg, signer);
}
