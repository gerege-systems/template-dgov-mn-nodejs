// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/ssoeidproxy нь dgov SSO (sso.dgov.mn)-ий eID proxy service-ийн client.
//
// SSO нь /rp/eid/* дор бүртгэгдсэн апп (RP)-уудад иргэний PKI самбарыг
// ДАМЖУУЛАН үзүүлдэг: апп нь хэрэглэгчийнхээ SSO access token-оор дуудахад SSO
// өөрийн eidmongolia RP creds-ээр өгөгдлийг татаж өгнө. Тиймээс энэ апп-д eID
// RP credential (PKI_READ) эзэмших ШААРДЛАГАГҮЙ — SSO хэрэглэдэг суулгацуудын
// гол ялгаа энэ.
//
//   GET {base}/summary       — dashboard-ын нэгдсэн тоо
//   GET {base}/certificates  — гэрчилгээ + статусын тоо
//   GET {base}/devices       — холбоотой төхөөрөмжүүд
//   GET {base}/activity      — RP-scoped auth/sign түүх
//
// base жишээ: https://sso.dgov.mn/rp/eid. Хариу нь {data: <snake_case DTO>}
// дугтуйтай — wire бүтцээр задалж, pkg/eid-ийн домэйн төрлүүд рүү буулгана.

import { ErrPKINotPermitted } from '../eid/eid_pki.js';
import type {
  ActivityCounts,
  CertCounts,
  PersonActivity,
  PersonActivityItem,
  PersonCertificates,
  PersonDevices,
  PersonDeviceItem,
  PersonSummary,
} from '../eid/eid_pki.js';

const maxRespBytes = 1 << 20; // 1 MiB
const httpTimeoutMs = 15_000;

/**
 * ErrSSOTokenExpired нь proxy 401 буцаах (access token хүчингүй/дууссан) үед
 * буцна — дуудагч refresh хийсний дараа ч 401 бол хэрэглэгчийг дахин нэвтрүүлнэ.
 */
export class ErrSSOTokenExpired extends Error {
  constructor() {
    super('ssoeidproxy: access token rejected (401)');
    this.name = 'ErrSSOTokenExpired';
  }
}

/** ErrSSOProxyDisabled нь SSO дээр "eid-proxy" gateway унтраалттай (503) үед буцна. */
export class ErrSSOProxyDisabled extends Error {
  constructor() {
    super('ssoeidproxy: eID proxy disabled at SSO (503)');
    this.name = 'ErrSSOProxyDisabled';
  }
}

/** SSOEidProxy нь PKI самбарыг SSO-гоор дамжуулан унших хийсвэрлэл. */
export interface SSOEidProxy {
  summary(accessToken: string, signal?: AbortSignal): Promise<PersonSummary>;
  certificates(accessToken: string, signal?: AbortSignal): Promise<PersonCertificates>;
  devices(accessToken: string, signal?: AbortSignal): Promise<PersonDevices>;
  activity(
    accessToken: string,
    limit: number,
    offset: number,
    signal?: AbortSignal,
  ): Promise<PersonActivity>;
}

interface WireCertCounts {
  valid?: number;
  revoked?: number;
  expired?: number;
  suspended?: number;
  total?: number;
}

interface WireActivityCounts {
  authentication?: number;
  signature?: number;
}

const counts = (w: WireCertCounts | undefined): CertCounts => ({
  valid: w?.valid ?? 0,
  revoked: w?.revoked ?? 0,
  expired: w?.expired ?? 0,
  suspended: w?.suspended ?? 0,
  total: w?.total ?? 0,
});

const activityCounts = (w: WireActivityCounts | undefined): ActivityCounts => ({
  authentication: w?.authentication ?? 0,
  signature: w?.signature ?? 0,
});

/** ts нь сонголттой огноог мөр болгоно (байхгүй бол хоосон — Go-ийн тэг time). */
const ts = (v: string | null | undefined): string => v ?? '';

class SSOEidProxyClient implements SSOEidProxy {
  private readonly base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.trim().replace(/\/+$/, '');
  }

  /**
   * get нь Bearer token-оор GET хийж, {data} доторх payload-ыг буцаана.
   *
   * 401 → ErrSSOTokenExpired · 403 → ErrPKINotPermitted · 503 →
   * ErrSSOProxyDisabled · 404 → null (өгөгдөл олдсонгүй, АЛДАА БИШ).
   */
  private async get<T>(accessToken: string, path: string, signal?: AbortSignal): Promise<T | null> {
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: combined,
      });
    } catch (err) {
      throw new Error(`ssoeidproxy request: ${err instanceof Error ? err.message : String(err)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const body = buf.subarray(0, maxRespBytes).toString('utf8');

    if (res.status === 401) throw new ErrSSOTokenExpired();
    if (res.status === 403) throw new ErrPKINotPermitted();
    if (res.status === 503) throw new ErrSSOProxyDisabled();
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ssoeidproxy: status ${res.status}`);
    }

    let env: { data?: unknown };
    try {
      env = JSON.parse(body) as { data?: unknown };
    } catch (err) {
      throw new Error(
        `ssoeidproxy decode envelope: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (env.data === undefined || env.data === null) return null;
    return env.data as T;
  }

  async summary(accessToken: string, signal?: AbortSignal): Promise<PersonSummary> {
    const w = await this.get<{
      given_name?: string;
      surname?: string;
      certificates?: WireCertCounts;
      activity?: WireActivityCounts;
      devices_active?: number;
      devices_total?: number;
      representation_count?: number;
    }>(accessToken, '/summary', signal);
    return {
      givenName: w?.given_name ?? '',
      surname: w?.surname ?? '',
      certificates: counts(w?.certificates),
      activity: activityCounts(w?.activity),
      devicesActive: w?.devices_active ?? 0,
      devicesTotal: w?.devices_total ?? 0,
      representationCount: w?.representation_count ?? 0,
    };
  }

  async certificates(accessToken: string, signal?: AbortSignal): Promise<PersonCertificates> {
    const w = await this.get<{
      counts?: WireCertCounts;
      certificates?: {
        document_number?: string;
        type?: string;
        serial_number?: string;
        certificate_level?: string;
        status?: string;
        not_before?: string | null;
        not_after?: string | null;
        issuer_dn?: string;
      }[];
    }>(accessToken, '/certificates', signal);
    return {
      counts: counts(w?.counts),
      certificates: (w?.certificates ?? []).map((x) => ({
        documentNumber: x.document_number ?? '',
        type: x.type ?? '',
        serialNumber: x.serial_number ?? '',
        certificateLevel: x.certificate_level ?? '',
        status: x.status ?? '',
        notBefore: ts(x.not_before),
        notAfter: ts(x.not_after),
        issuerDn: x.issuer_dn ?? '',
      })),
    };
  }

  async devices(accessToken: string, signal?: AbortSignal): Promise<PersonDevices> {
    const w = await this.get<{
      devices?: {
        document_number?: string;
        platform?: string;
        enrolled_at?: string | null;
        active?: boolean;
        deactivated_at?: string | null;
        extra?: Record<string, unknown>;
      }[];
      active_count?: number;
      total?: number;
    }>(accessToken, '/devices', signal);
    const devices: PersonDeviceItem[] = (w?.devices ?? []).map((x) => ({
      documentNumber: x.document_number ?? '',
      platform: x.platform ?? '',
      enrolledAt: ts(x.enrolled_at),
      active: x.active ?? false,
      deactivatedAt: x.deactivated_at ?? null,
      // SSO нь танихгүй талбаруудыг `extra` дор цуглуулж дамжуулдаг — тэднийг
      // үндсэн объект руу тараана (шууд eID замтай ижил хэлбэр гарна).
      ...(x.extra ?? {}),
    }));
    return { devices, activeCount: w?.active_count ?? 0, total: w?.total ?? 0 };
  }

  async activity(
    accessToken: string,
    limit: number,
    offset: number,
    signal?: AbortSignal,
  ): Promise<PersonActivity> {
    const q = new URLSearchParams();
    if (limit > 0) q.set('limit', String(limit));
    if (offset > 0) q.set('offset', String(offset));
    const enc = q.toString();
    const path = enc === '' ? '/activity' : `/activity?${enc}`;

    const w = await this.get<{
      counts?: WireActivityCounts;
      sessions?: {
        session_id?: string;
        flow?: string;
        outcome?: string;
        doc_text?: string;
        timestamp?: string | null;
        extra?: Record<string, unknown>;
      }[];
      total?: number;
    }>(accessToken, path, signal);

    const sessions: PersonActivityItem[] = (w?.sessions ?? []).map((x) => ({
      sessionId: x.session_id ?? '',
      flow: x.flow ?? '',
      outcome: x.outcome ?? '',
      docText: x.doc_text ?? '',
      timestamp: ts(x.timestamp),
      ...(x.extra ?? {}),
    }));
    return { counts: activityCounts(w?.counts), sessions, total: w?.total ?? 0 };
  }
}

/** newSSOEidProxy нь base URL (жишээ https://sso.dgov.mn/rp/eid)-ээр client үүсгэнэ. */
export const newSSOEidProxy = (baseUrl: string): SSOEidProxy => new SSOEidProxyClient(baseUrl);
