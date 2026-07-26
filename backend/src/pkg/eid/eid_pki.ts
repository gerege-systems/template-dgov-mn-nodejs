// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Иргэн өөрийн PKI самбарыг RP-ээр харах endpoint-уудын client. Эдгээр нь PII
// тул зөвхөн админаас PKI_READ эрх олгосон RP-д нээгддэг — эрхгүй бол 403 →
// ErrPKINotPermitted буцна (АЛДАА БИШ: UI "эрх хүлээгдэж байна" болгож харуулна).
//
//   GET /v3/certificates/etsi/{personEtsi}   — гэрчилгээний жагсаалт + статусын тоо
//   GET /v3/devices/etsi/{personEtsi}        — холбоотой төхөөрөмжүүд
//   GET /v3/rp/activity/etsi/{personEtsi}    — RP-scoped auth/sign түүх + тоо
//   GET /v3/person/summary/etsi/{personEtsi} — dashboard-ын нэгдсэн тоо

import { parseJSON, snippet, type EidRequester } from './transport.js';

/**
 * ErrPKINotPermitted нь RP-д PKI_READ эрх олгогдоогүй (403) үед буцна. Дуудагч
 * үүнийг "эрх хүлээгдэж байна" төлөв болгон харуулж болно (алдаа биш).
 */
export class ErrPKINotPermitted extends Error {
  constructor() {
    super('eid: RP lacks PKI_READ permission');
    this.name = 'ErrPKINotPermitted';
  }
}

/** CertCounts нь гэрчилгээний статусын тоолол. */
export interface CertCounts {
  valid: number;
  revoked: number;
  expired: number;
  suspended: number;
  total: number;
}

/** PersonCertItem нь иргэний нэг гэрчилгээ. */
export interface PersonCertItem {
  documentNumber: string;
  /** AUTH | SIGN | SEAL */
  type: string;
  serialNumber: string;
  certificateLevel: string;
  /** VALID | REVOKED | EXPIRED | SUSPENDED */
  status: string;
  notBefore: string;
  notAfter: string;
  issuerDn: string;
}

export interface PersonCertificates {
  counts: CertCounts;
  certificates: PersonCertItem[];
}

/** ActivityCounts нь flow тус бүрийн тоолол. */
export interface ActivityCounts {
  authentication: number;
  signature: number;
}

/**
 * PersonActivityItem нь RP-scoped session түүхийн нэг бичлэг.
 *
 * Танигдсан талбаруудаас БУСАД бүх түлхүүр ХЭВЭЭР үлдэнэ (index signature) —
 * upstream өргөжихөд UI ямар ч талбарыг харуулж чадна ("бүгдийг харуул"). Go
 * хувилбарт энэ нь `Extra map[string]any` + custom UnmarshalJSON байсан;
 * JavaScript-д объект нь аль хэдийн задлагдсан хэлбэрээрээ бүх түлхүүрээ
 * зөөдөг тул нэмэлт код шаардлагагүй.
 */
export interface PersonActivityItem {
  sessionId?: string;
  /** AUTHENTICATION | SIGNATURE */
  flow?: string;
  outcome?: string;
  docText?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface PersonActivity {
  counts: ActivityCounts;
  sessions: PersonActivityItem[];
  total: number;
}

/** PersonDeviceItem нь холбоотой нэг төхөөрөмж (танихгүй талбарууд хэвээр үлдэнэ). */
export interface PersonDeviceItem {
  documentNumber?: string;
  /** APNS | FCM */
  platform?: string;
  enrolledAt?: string;
  active?: boolean;
  deactivatedAt?: string | null;
  [key: string]: unknown;
}

export interface PersonDevices {
  devices: PersonDeviceItem[];
  activeCount: number;
  total: number;
}

/**
 * PersonSummary нь dashboard-ын нэгдсэн тоо (нэг дуудлагаар гэрчилгээ/activity/
 * төхөөрөмж/байгууллага).
 */
export interface PersonSummary {
  givenName: string;
  surname: string;
  certificates: CertCounts;
  activity: ActivityCounts;
  devicesActive: number;
  devicesTotal: number;
  representationCount: number;
}

const emptyCounts = (): CertCounts => ({
  valid: 0,
  revoked: 0,
  expired: 0,
  suspended: 0,
  total: 0,
});

const emptyActivityCounts = (): ActivityCounts => ({ authentication: 0, signature: 0 });

/**
 * getPKI нь PKI endpoint-ыг дуудаж хариуг задлана.
 *
 * 403 → ErrPKINotPermitted. 404 → `null` (хүн/өгөгдөл олдсонгүй; дуудагч
 * тэг утгатай бүтэц буцаана — Go хувилбарт зэрэг zero-value үлддэгтэй ижил).
 */
async function getPKI<T>(
  http: EidRequester,
  path: string,
  signal?: AbortSignal,
): Promise<T | null> {
  const { raw, status } = await http.get(path, signal);
  if (status === 403) throw new ErrPKINotPermitted();
  if (status === 404) return null;
  if (status >= 300) throw new Error(`eid pki: status ${status}: ${snippet(raw)}`);
  return parseJSON<T>(raw, 'eid pki');
}

/** etsiPath нь PKI замыг угсарна; personEtsi хоосон бол алдаа. */
function etsiPath(prefix: string, personEtsi: string): string {
  const p = personEtsi.trim();
  if (p === '') throw new Error('eid: empty personEtsi');
  return prefix + encodeURIComponent(p);
}

export async function personSummary(
  http: EidRequester,
  personEtsi: string,
  signal?: AbortSignal,
): Promise<PersonSummary> {
  const out = await getPKI<PersonSummary>(
    http,
    etsiPath('/person/summary/etsi/', personEtsi),
    signal,
  );
  return (
    out ?? {
      givenName: '',
      surname: '',
      certificates: emptyCounts(),
      activity: emptyActivityCounts(),
      devicesActive: 0,
      devicesTotal: 0,
      representationCount: 0,
    }
  );
}

export async function personCertificates(
  http: EidRequester,
  personEtsi: string,
  signal?: AbortSignal,
): Promise<PersonCertificates> {
  const out = await getPKI<PersonCertificates>(
    http,
    etsiPath('/certificates/etsi/', personEtsi),
    signal,
  );
  return out ?? { counts: emptyCounts(), certificates: [] };
}

export async function personDevices(
  http: EidRequester,
  personEtsi: string,
  signal?: AbortSignal,
): Promise<PersonDevices> {
  const out = await getPKI<PersonDevices>(http, etsiPath('/devices/etsi/', personEtsi), signal);
  return out ?? { devices: [], activeCount: 0, total: 0 };
}

export async function personActivity(
  http: EidRequester,
  personEtsi: string,
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<PersonActivity> {
  const base = etsiPath('/rp/activity/etsi/', personEtsi);
  const lim = limit <= 0 ? 20 : limit;
  const path = `${base}?limit=${String(lim)}&offset=${String(offset)}`;
  const out = await getPKI<PersonActivity>(http, path, signal);
  return out ?? { counts: emptyActivityCounts(), sessions: [], total: 0 };
}
