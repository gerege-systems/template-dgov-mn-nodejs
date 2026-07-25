// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/eid нь eID Mongolia (eidmongolia.mn) identity provider-ийн Relying Party
// (RP) client юм. Энэ template нь RP-ийн үүрэг гүйцэтгэнэ: Smart-ID нийцтэй v3
// API-аар (ACSP_V2) QR/push нэвтрэлтийг эхлүүлж, session-ийг long-poll-оор
// хүлээж, амжилттай (COMPLETE + endResult=OK) болоход IdP-ийн баталгаажуулсан
// иргэний identity-г (person блок) хүлээн авдаг.
//
// Wire protocol (well-known: https://eidmongolia.mn/.well-known/eid):
//
//   POST {base}/authentication/device-link/anonymous            → QR нэвтрэлт
//   POST {base}/authentication/notification/etsi/PNOMN-{civil}  → РД push нэвтрэлт
//   GET  {base}/session/{sessionID}?timeoutMs=25000             → long-poll төлөв
//   Auth header: Authorization: Bearer <rp_sk_...>  +  body-д relyingPartyUUID/Name
//
// COMPLETE хариу нь зөвхөн state=COMPLETE-г буцаадаг; ЖИНХЭНЭ терминал үр дүн
// (OK / TIMEOUT / USER_REFUSED* / WRONG_VC) нь result.endResult-д байна. Client
// эдгээрийг template-ийн энгийн төлөв рүү (COMPLETE / EXPIRED / REFUSED) буулгана.
//
// IdP нь TLS-ээр хамгаалагдсан, эрх бүхий (authoritative) эх сурвалж бөгөөд RP
// Bearer secret-ээр танигдана. person блок нь иргэний нэр/civil_id-г кирилл+латин
// хэлбэрээр шууд өгдөг тул сертификат задлах шаардлагагүй.
//
// ХАМРАХ ХҮРЭЭ: одоогоор нэвтрэлтийн (auth) гадаргуу — qrInitiate · initiate ·
// session. Байгууллагын төлөөлөл (representations / signers) болон иргэний PKI
// самбарын endpoint-ууд нь `org` ба `eidprofile` домэйнтэй хамт нэмэгдэнэ.

import { randomBytes, X509Certificate } from 'node:crypto';

/** ErrSessionExpired нь session хугацаа дууссан (terminal) үед буцна. */
export class ErrSessionExpired extends Error {
  constructor() {
    super('eid: session expired');
    this.name = 'ErrSessionExpired';
  }
}

/** ErrSessionRefused нь хэрэглэгч нэвтрэлтийг татгалзсан (terminal) үед буцна. */
export class ErrSessionRefused extends Error {
  constructor() {
    super('eid: session refused');
    this.name = 'ErrSessionRefused';
  }
}

/**
 * ErrInitiateRejected нь IdP initiate-г 4xx-ээр буцаасан (жишээ нь РД олдсонгүй /
 * буруу формат / RP эрх) үед буцна — дуудагч үүнийг цэвэр 4xx хэрэглэгчийн алдаа
 * болгож буулгана (5xx дотоод алдаанаас ялгаатай).
 */
export class ErrInitiateRejected extends Error {
  constructor(detail: string) {
    super(`eid: initiate rejected: ${detail}`);
    this.name = 'ErrInitiateRejected';
  }
}

/**
 * Template-ийн энгийн session төлвүүд. eID Mongolia v3 нь state-ээр зөвхөн
 * RUNNING/COMPLETE буцаадаг тул терминал бүтэлгүйтлийг (endResult) эдгээр рүү
 * буулгана — frontend эдгээрийг хүлээдэг.
 */
export const StateComplete = 'COMPLETE';
export const StateExpired = 'EXPIRED';
export const StateRefused = 'REFUSED';
export const StateRunning = 'RUNNING';

const defaultBase = 'https://eidmongolia.mn/v3';
const defaultRPName = 'template-web';
/**
 * defaultCertLevel нь нэвтрэлтэд хүсэх гэрчилгээний ДООД түвшин. Smart-ID-д
 * хүссэн түвшин нь минимум тул ADVANCED нь ADVANCED/QUALIFIED/QSCD бүх гэрчилгээг
 * хүлээн авна — нэвтрэлтийн гэрчилгээ ихэвчлэн ADVANCED тул QUALIFIED шаардвал
 * ийм иргэн нэвтэрч чадахгүй.
 */
const defaultCertLevel = 'ADVANCED';
const maxRespBytes = 256 << 10;
/** Poll нь 25с хүртэл long-poll хийдэг тул HTTP timeout-ийг 30с болгов. */
const httpTimeoutMs = 30_000;

/** Certificate нь иргэний eID сертификатын нээлттэй хэсэг (X.509-аас задалсан). */
export interface Certificate {
  serial: string;
  notBefore: Date;
  notAfter: Date;
  /** олгогч CA-ийн subject CN */
  issuer: string;
  /** жишээ: "ECDSA P-256", "RSA 2048" */
  keyType: string;
}

/** Identity нь IdP-ийн баталгаажуулсан иргэний таних мэдээлэл юм. */
export interface Identity {
  nationalId: string;
  civilId: string;
  givenName: string;
  surname: string;
  givenNameEn: string;
  surnameEn: string;
  kycLevel: string;
  documentNumber: string;
  /**
   * certificate нь login COMPLETE-ийн cert.value (DER)-ээс задлагдсан
   * сертификатын дэлгэрэнгүй. Cert байхгүй/задлагдахгүй бол null (нэвтрэлт
   * зогсохгүй — зөвхөн нэмэлт мэдээлэл).
   */
  certificate: Certificate | null;
}

/** StartResult нь initiate хариуны клиентэд харагдах хэсэг. */
export interface StartResult {
  sessionId: string;
  verificationCode: string;
  expiresAt: string;
  deviceLinkUrl: string;
}

/** SessionResult нь session poll-ийн үр дүн. identity нь зөвхөн COMPLETE+OK үед. */
export interface SessionResult {
  state: string;
  identity: Identity | null;
}

/** EidClient нь eID RP урсгалуудын хийсвэрлэл — тестэд хуурамчаар тавихад хялбар. */
export interface EidClient {
  /**
   * qrInitiate нь QR нэвтрэлтийг эхлүүлж session мэдээллийг буцаана. callbackUrl
   * хоосон бол CROSS-DEVICE (desktop QR — browser өөрөө poll хийнэ); хоосон биш
   * бол SAME-DEVICE (mobile browser App2App — утас approve хийсний дараа browser
   * буцна).
   */
  qrInitiate(displayText: string, callbackUrl: string, signal?: AbortSignal): Promise<StartResult>;
  /**
   * initiate нь иргэний РД (civil_id)-аар нэвтрэлтийг эхлүүлнэ — IdP нь тухайн
   * РД-тэй холбоотой бүртгэлтэй төхөөрөмж рүү баталгаажуулах push мэдэгдэл
   * илгээдэг. device_link шаардлагагүй тул хариунд deviceLinkUrl хоосон.
   */
  initiate(
    nationalId: string,
    displayText: string,
    callbackUrl: string,
    signal?: AbortSignal,
  ): Promise<StartResult>;
  /** session нь session-ийн төлвийг long-poll-оор асууна (timeoutMs хүртэл). */
  session(sessionId: string, timeoutMs: number, signal?: AbortSignal): Promise<SessionResult>;
}

/**
 * interaction нь eID апп-ийн баталгаажуулах дэлгэцэнд харагдах Smart-ID v3
 * interaction (одоогоор displayTextAndPIN). displayText60 нь дээд 60 тэмдэгт.
 */
interface Interaction {
  type: string;
  displayText60?: string;
}

/**
 * AuthInitiateBody нь auth initiate (device-link + notification)-ийн ACSP_V2
 * хүсэлтийн бие.
 *
 * АНХААР: auth-д challenge талбар нь `rpChallenge` (base64 nonce) — sign-ийн
 * `digest`/`hashType`-ээс ЯЛГААТАЙ. Буруу `hash` талбар илгээвэл сервер
 * rpChallenge-ийг хоосон гэж үзэж, PIN үед ACSP payload эвдэрч "боловсруулах
 * алдаа" өгдөг. interactions нь ЗААВАЛ (апп дэлгэцэнд харуулах текст).
 */
interface AuthInitiateBody {
  relyingPartyUUID: string;
  relyingPartyName: string;
  certificateLevel: string;
  signatureProtocol: string;
  rpChallenge: string;
  interactions: Interaction[];
  /**
   * rp_app / rp_app_url — нэвтрэлт эхлүүлж буй RP апп-ийн нэр/домэйн. eID апп-ийн
   * push дэлгэц ҮҮНИЙГ харуулна ("<апп> нэвтрэхийг хүсэж байна").
   */
  rp_app?: string;
  rp_app_url?: string;
  /**
   * initialCallbackUrl — SAME-DEVICE (mobile browser App2App) буцах URL. Хоосон
   * бол CROSS-DEVICE: eID backend утас руу callback дамжуулахгүй, browser өөрөө
   * poll хийнэ.
   */
  initialCallbackUrl?: string;
}

/** snippet нь алдааны мессежид тавих хариуны эхний 200 тэмдэгтийг буцаана. */
function snippet(raw: string): string {
  const s = raw.trim();
  return s.length > 200 ? s.slice(0, 200) : s;
}

/**
 * randomChallengeB64 нь ACSP_V2 challenge болох 32 байт crypto-random-ийг
 * base64-std хэлбэрээр буцаана.
 */
function randomChallengeB64(): string {
  return randomBytes(32).toString('base64');
}

/**
 * parseVC нь vc талбарыг задлана — anonymous нь string ("7270"), notification нь
 * {"type":"alphaNumeric4","value":"0489"} object буцаадаг тул хоёуланг тэсвэрлэнэ.
 */
export function parseVC(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && 'value' in raw) {
    const v = (raw as { value?: unknown }).value;
    return typeof v === 'string' ? v : '';
  }
  return '';
}

/**
 * checkInitiateStatus нь initiate хариуны HTTP статусыг шалгана: 4xx = RP/оролтын
 * алдаа (ErrInitiateRejected), бусад 3xx+ = дотоод алдаа.
 */
function checkInitiateStatus(raw: string, status: number): void {
  if (status >= 400 && status < 500) {
    throw new ErrInitiateRejected(`status ${status}: ${snippet(raw)}`);
  }
  if (status >= 300) {
    throw new Error(`eid initiate: status ${status}: ${snippet(raw)}`);
  }
}

/**
 * curveName нь Node-ийн OpenSSL нэрийг Go-ийн elliptic.Curve нэр болгоно —
 * keyType мөр Go хувилбартай ижил гарахын тулд ("ECDSA P-256").
 */
const curveName = (named: string | undefined): string => {
  switch (named) {
    case 'prime256v1':
      return 'P-256';
    case 'secp384r1':
      return 'P-384';
    case 'secp521r1':
      return 'P-521';
    default:
      return named ?? 'unknown';
  }
};

/** keyTypeOf нь сертификатын нийтийн түлхүүрийн алгоритм + хэмжээг буцаана. */
function keyTypeOf(cert: X509Certificate): string {
  const key = cert.publicKey;
  const details = key.asymmetricKeyDetails;
  switch (key.asymmetricKeyType) {
    case 'ec':
      return `ECDSA ${curveName(details?.namedCurve)}`;
    case 'rsa':
    case 'rsa-pss':
      return `RSA ${String(details?.modulusLength ?? 0)}`;
    default:
      return key.asymmetricKeyType ?? 'unknown';
  }
}

/** issuerCN нь issuer мөрөөс CN-г гаргана (Node нь бүх RDN-г мөрөөр өгдөг). */
function issuerCN(issuer: string): string {
  for (const line of issuer.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('CN=')) return trimmed.slice(3);
  }
  return '';
}

/**
 * normalizeSerial нь Node-ийн том үсэгтэй, тэглэсэн hex серийг Go-ийн
 * `SerialNumber.Text(16)`-тай ижил (жижиг үсэг, эхний тэггүй) болгоно.
 */
function normalizeSerial(serial: string): string {
  const lower = serial.toLowerCase().replace(/^0+/, '');
  return lower === '' ? '0' : lower;
}

/**
 * parseCertificate нь base64 DER сертификатыг задлан нээлттэй хэсгийг буцаана.
 * Задлагдахгүй/хоосон бол null (нэвтрэлтэд саад болохгүй).
 *
 * Node-ийн төрөлх X509Certificate-ийг ашиглав — node-forge нь EC нийтийн
 * түлхүүрийг уншиж чаддаггүй бөгөөд eID сертификатууд ихэвчлэн ECDSA байдаг.
 */
export function parseCertificate(b64: string): Certificate | null {
  const trimmed = b64.trim();
  if (trimmed === '') return null;
  try {
    const cert = new X509Certificate(Buffer.from(trimmed, 'base64'));
    return {
      serial: normalizeSerial(cert.serialNumber),
      notBefore: new Date(cert.validFrom),
      notAfter: new Date(cert.validTo),
      issuer: issuerCN(cert.issuer),
      keyType: keyTypeOf(cert),
    };
  } catch {
    return null;
  }
}

class EidClientImpl implements EidClient {
  private readonly base: string;
  private readonly rpName: string;
  private readonly certLevel: string;

  constructor(
    base: string,
    private readonly rpUUID: string,
    rpName: string,
    private readonly secret: string,
    certLevel: string,
  ) {
    this.base = (base === '' ? defaultBase : base).replace(/\/+$/, '');
    this.rpName = rpName === '' ? defaultRPName : rpName;
    this.certLevel = certLevel === '' ? defaultCertLevel : certLevel;
  }

  private newAuthBody(displayText: string, callbackUrl: string): AuthInitiateBody {
    let dt = displayText === '' ? this.rpName : displayText;
    if (dt.length > 60) dt = dt.slice(0, 60);
    const body: AuthInitiateBody = {
      relyingPartyUUID: this.rpUUID,
      relyingPartyName: this.rpName,
      certificateLevel: this.certLevel,
      signatureProtocol: 'ACSP_V2',
      rpChallenge: randomChallengeB64(),
      interactions: [{ type: 'displayTextAndPIN', displayText60: dt }],
      // eID push дэлгэц дээр харагдах RP апп-ийн нэр.
      rp_app: this.rpName,
    };
    if (callbackUrl !== '') body.initialCallbackUrl = callbackUrl;
    return body;
  }

  async qrInitiate(
    displayText: string,
    callbackUrl: string,
    signal?: AbortSignal,
  ): Promise<StartResult> {
    const { raw, status } = await this.request(
      'POST',
      '/authentication/device-link/anonymous',
      this.newAuthBody(displayText, callbackUrl),
      signal,
    );
    checkInitiateStatus(raw, status);

    const out = parseJSON<{ sessionID?: string; vc?: unknown }>(raw, 'eid initiate');
    if (!out.sessionID) {
      throw new Error(`eid initiate: empty/invalid sessionID: ${snippet(raw)}`);
    }
    // QR-д кодлох агуулга нь ЗҮГЭЭР session UUID — eID апп-ийн QR scanner UUID-г
    // session ID гэж тайлбарлаж, өөрийн серверт резолв хийдэг. `https://…/dl?…`
    // URL тавьбал апп задалж чадалгүй унана.
    return {
      sessionId: out.sessionID,
      verificationCode: parseVC(out.vc),
      expiresAt: '',
      deviceLinkUrl: out.sessionID,
    };
  }

  async initiate(
    nationalId: string,
    displayText: string,
    callbackUrl: string,
    signal?: AbortSignal,
  ): Promise<StartResult> {
    // РД push: semanticsIdentifier нь ETSI EN 319 412-1 дагуу хувь хүнд
    // PNOMN-<civil_id>. IdP тухайн иргэний бүртгэлтэй төхөөрөмж рүү push хийнэ.
    const path = `/authentication/notification/etsi/PNOMN-${encodeURIComponent(nationalId.trim())}`;
    const { raw, status } = await this.request(
      'POST',
      path,
      this.newAuthBody(displayText, callbackUrl),
      signal,
    );
    checkInitiateStatus(raw, status);

    const out = parseJSON<{ sessionID?: string; vc?: unknown }>(raw, 'eid initiate');
    if (!out.sessionID) {
      throw new Error(`eid initiate: empty/invalid sessionID: ${snippet(raw)}`);
    }
    return {
      sessionId: out.sessionID,
      verificationCode: parseVC(out.vc),
      expiresAt: '',
      deviceLinkUrl: '',
    };
  }

  async session(
    sessionId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<SessionResult> {
    if (sessionId === '') throw new Error('eid: empty session_id');
    const path = `/session/${encodeURIComponent(sessionId)}?timeoutMs=${String(timeoutMs)}`;
    const { raw, status } = await this.request('GET', path, undefined, signal);
    if (status >= 300) {
      throw new Error(`eid session: status ${status}: ${snippet(raw)}`);
    }

    const out = parseJSON<{
      state?: string;
      result?: { endResult?: string; documentNumber?: string } | null;
      cert?: { value?: string; certificateLevel?: string } | null;
      person?: {
        givenName?: string;
        surname?: string;
        givenNameEn?: string;
        surnameEn?: string;
        civilId?: string;
        regNo?: string;
      } | null;
    }>(raw, 'eid session');
    if (!out.state) throw new Error(`eid session: invalid response: ${snippet(raw)}`);

    // state=RUNNING → хараахан дуусаагүй.
    if (out.state !== 'COMPLETE') return { state: StateRunning, identity: null };

    // COMPLETE: ЖИНХЭНЭ үр дүн endResult-д. OK биш бол EXPIRED/REFUSED рүү буулгана.
    const endResult = out.result?.endResult ?? '';
    if (endResult !== 'OK') {
      if (endResult === 'TIMEOUT') return { state: StateExpired, identity: null };
      // USER_REFUSED*, WRONG_VC, DOCUMENT_UNUSABLE гэх мэт — татгалзсан гэж үзнэ.
      return { state: StateRefused, identity: null };
    }

    if (!out.person) {
      throw new Error(`eid session: COMPLETE+OK without person block: ${snippet(raw)}`);
    }
    const identity: Identity = {
      civilId: out.person.civilId ?? '',
      nationalId: out.person.regNo ?? '',
      givenName: out.person.givenName ?? '',
      surname: out.person.surname ?? '',
      givenNameEn: out.person.givenNameEn ?? '',
      surnameEn: out.person.surnameEn ?? '',
      kycLevel: out.cert?.certificateLevel ?? '',
      documentNumber: out.result?.documentNumber ?? '',
      // cert.value байвал X.509-ийг задлан нээлттэй хэсгийг авна. Задлагдахгүй бол
      // зүгээр алгасна — нэвтрэлт зогсохгүй (cert нь зөвхөн нэмэлт мэдээлэл).
      certificate: parseCertificate(out.cert?.value ?? ''),
    };
    return { state: StateComplete, identity };
  }

  /**
   * request нь бүх HTTP дуудлагын нэгдсэн гарц: RP Bearer secret-ийг header-т
   * тавьж (log-д хэзээ ч гарахгүй), хариуны биеийг maxRespBytes-ээр хязгаарлаж,
   * дуудагчийн signal болон 30с timeout-ийг хамтад хүндэтгэнэ.
   */
  private async request(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<{ raw: string; status: number }> {
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
}

/** parseJSON нь хариуг задлана; JSON биш бол контексттэй алдаа шиднэ. */
function parseJSON<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${context}: invalid response: ${snippet(raw)}`);
  }
}

/**
 * newEidClient нь eID Mongolia RP client үүсгэнэ. base/rpName/certLevel хоосон
 * бол өгөгдмөл утга авна. rpUUID/secret нь оператороос олгогдсон RP таних
 * мэдээлэл — secret нь Authorization: Bearer header-т явна, log-д гарахгүй.
 */
export function newEidClient(
  base: string,
  rpUUID: string,
  rpName: string,
  secret: string,
  certLevel: string,
): EidClient {
  return new EidClientImpl(base, rpUUID, rpName, secret, certLevel);
}
