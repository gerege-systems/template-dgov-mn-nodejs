// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// eID профайлын хариуны DTO-нууд. Wire формат нь snake_case (клиенттэй нийцтэй);
// хоосон талбарууд хариунд ОРОХГҮЙ (Go-ийн `omitempty` гэрээ).

import type { Representation, Signer, SignersResult } from '../../../pkg/eid/eid_org.js';
import type {
  ActivityCounts,
  CertCounts,
  PersonActivity,
  PersonCertificates,
  PersonDevices,
  PersonSummary,
} from '../../../pkg/eid/eid_pki.js';

/** OrgRepresentationResponse нь иргэний төлөөлдөг нэг байгууллага. */
export interface OrgRepresentationResponse {
  org_etsi: string;
  org_register: string;
  org_name: string;
  org_name_en?: string;
  role?: string;
  right_type?: string;
  valid_from?: Date;
  valid_to?: Date;
}

export function orgRepresentationsResponse(reps: Representation[]): OrgRepresentationResponse[] {
  return reps.map((r) => {
    const out: OrgRepresentationResponse = {
      org_etsi: r.orgEtsi,
      org_register: r.orgRegister,
      org_name: r.orgName,
    };
    if (r.orgNameEn !== '') out.org_name_en = r.orgNameEn;
    if (r.role !== '') out.role = r.role;
    if (r.rightType !== '') out.right_type = r.rightType;
    if (r.validFrom !== null) out.valid_from = r.validFrom;
    if (r.validTo !== null) out.valid_to = r.validTo;
    return out;
  });
}

/** OrgSignerResponse нь байгууллагыг төлөөлж / гарын үсэг зурж чадах нэг иргэн. */
export interface OrgSignerResponse {
  person_etsi: string;
  reg_no?: string;
  name?: string;
  name_en?: string;
  role?: string;
  right_type: string;
  /** ACTIVE | PENDING (sign-push баталгаажуулалт) */
  status: string;
  source: string;
  self: boolean;
}

export function orgSignersResponse(signers: Signer[]): OrgSignerResponse[] {
  return signers.map((s) => {
    const out: OrgSignerResponse = {
      person_etsi: s.personEtsi,
      right_type: s.rightType,
      status: s.status,
      source: s.source,
      self: s.self,
    };
    if (s.regNo !== '') out.reg_no = s.regNo;
    if (s.name !== '') out.name = s.name;
    if (s.nameEn !== '') out.name_en = s.nameEn;
    if (s.role !== '') out.role = s.role;
    return out;
  });
}

/**
 * OrgSignersResultResponse нь зурагч НЭМЭХ хариу — жагсаалт + хүлээгдэж буй
 * sign-push баталгаажуулалт (клиент "хүсэлт илгээгдлээ" гэж харуулна).
 */
export interface OrgSignersResultResponse {
  signers: OrgSignerResponse[];
  pending_confirmation?: {
    signer_etsi: string;
    signer_reg_no?: string;
    session_id: string;
  };
}

export function orgSignersResultResponse(res: SignersResult): OrgSignersResultResponse {
  const out: OrgSignersResultResponse = { signers: orgSignersResponse(res.signers) };
  const pc = res.pendingConfirmation;
  if (pc !== null) {
    out.pending_confirmation = {
      signer_etsi: pc.signerEtsi,
      session_id: pc.sessionId,
      ...(pc.signerRegNo === '' ? {} : { signer_reg_no: pc.signerRegNo }),
    };
  }
  return out;
}

// ── PKI самбар ──

interface EIDCertCounts {
  valid: number;
  revoked: number;
  expired: number;
  suspended: number;
  total: number;
}

interface EIDActivityCounts {
  authentication: number;
  signature: number;
}

const certCounts = (c: CertCounts): EIDCertCounts => ({
  valid: c.valid,
  revoked: c.revoked,
  expired: c.expired,
  suspended: c.suspended,
  total: c.total,
});

const activityCounts = (a: ActivityCounts): EIDActivityCounts => ({
  authentication: a.authentication,
  signature: a.signature,
});

/** optTime нь хоосон огноог хариунаас хасна (Go-ийн тэг time → nil). */
const optTime = (v: string | undefined): string | undefined =>
  v === undefined || v === '' ? undefined : v;

/**
 * knownKeys-ээс бусад бүх түлхүүрийг `extra` дор цуглуулна — upstream-ийн шинэ
 * талбарууд UI-д хүрнэ ("бүгдийг харуул"), гэхдээ үндсэн бүтцийг бохирдуулахгүй.
 */
function extraOf(obj: Record<string, unknown>, known: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.includes(k)) out[k] = v;
  }
  return out;
}

export interface EIDCertificatesResponse {
  counts: EIDCertCounts;
  certificates: {
    document_number: string;
    type: string;
    serial_number: string;
    certificate_level: string;
    status: string;
    not_before?: string;
    not_after?: string;
    issuer_dn?: string;
  }[];
}

export function eidCertificatesResponse(c: PersonCertificates | null): EIDCertificatesResponse {
  if (c === null) {
    return { counts: certCounts(zeroCounts), certificates: [] };
  }
  return {
    counts: certCounts(c.counts),
    certificates: c.certificates.map((x) => ({
      document_number: x.documentNumber,
      type: x.type,
      serial_number: x.serialNumber,
      certificate_level: x.certificateLevel,
      status: x.status,
      ...(optTime(x.notBefore) === undefined ? {} : { not_before: x.notBefore }),
      ...(optTime(x.notAfter) === undefined ? {} : { not_after: x.notAfter }),
      ...(x.issuerDn === '' ? {} : { issuer_dn: x.issuerDn }),
    })),
  };
}

const zeroCounts: CertCounts = { valid: 0, revoked: 0, expired: 0, suspended: 0, total: 0 };
const zeroActivity: ActivityCounts = { authentication: 0, signature: 0 };

const deviceKnownKeys = ['documentNumber', 'platform', 'enrolledAt', 'active', 'deactivatedAt'];

export interface EIDDevicesResponse {
  devices: {
    document_number: string;
    platform?: string;
    enrolled_at?: string;
    active: boolean;
    deactivated_at?: string;
    extra?: Record<string, unknown>;
  }[];
  active_count: number;
  total: number;
}

export function eidDevicesResponse(d: PersonDevices | null): EIDDevicesResponse {
  if (d === null) return { devices: [], active_count: 0, total: 0 };
  return {
    devices: d.devices.map((x) => {
      const extra = extraOf(x, deviceKnownKeys);
      return {
        document_number: x.documentNumber ?? '',
        active: x.active ?? false,
        ...(x.platform === undefined || x.platform === '' ? {} : { platform: x.platform }),
        ...(optTime(x.enrolledAt) === undefined ? {} : { enrolled_at: x.enrolledAt }),
        ...(x.deactivatedAt === undefined || x.deactivatedAt === null
          ? {}
          : { deactivated_at: x.deactivatedAt }),
        ...(Object.keys(extra).length === 0 ? {} : { extra }),
      };
    }),
    active_count: d.activeCount,
    total: d.total,
  };
}

const activityKnownKeys = ['sessionId', 'flow', 'outcome', 'docText', 'timestamp'];

export interface EIDActivityResponse {
  counts: EIDActivityCounts;
  sessions: {
    session_id?: string;
    flow: string;
    outcome: string;
    doc_text?: string;
    timestamp?: string;
    extra?: Record<string, unknown>;
  }[];
  total: number;
}

export function eidActivityResponse(a: PersonActivity | null): EIDActivityResponse {
  if (a === null) return { counts: activityCounts(zeroActivity), sessions: [], total: 0 };
  return {
    counts: activityCounts(a.counts),
    sessions: a.sessions.map((x) => {
      const extra = extraOf(x, activityKnownKeys);
      return {
        flow: x.flow ?? '',
        outcome: x.outcome ?? '',
        ...(x.sessionId === undefined || x.sessionId === '' ? {} : { session_id: x.sessionId }),
        ...(x.docText === undefined || x.docText === '' ? {} : { doc_text: x.docText }),
        ...(optTime(x.timestamp) === undefined ? {} : { timestamp: x.timestamp }),
        ...(Object.keys(extra).length === 0 ? {} : { extra }),
      };
    }),
    total: a.total,
  };
}

export interface EIDSummaryResponse {
  given_name?: string;
  surname?: string;
  certificates: EIDCertCounts;
  activity: EIDActivityCounts;
  devices_active: number;
  devices_total: number;
  representation_count: number;
}

export function eidSummaryResponse(s: PersonSummary | null): EIDSummaryResponse {
  if (s === null) {
    return {
      certificates: certCounts(zeroCounts),
      activity: activityCounts(zeroActivity),
      devices_active: 0,
      devices_total: 0,
      representation_count: 0,
    };
  }
  return {
    ...(s.givenName === '' ? {} : { given_name: s.givenName }),
    ...(s.surname === '' ? {} : { surname: s.surname }),
    certificates: certCounts(s.certificates),
    activity: activityCounts(s.activity),
    devices_active: s.devicesActive,
    devices_total: s.devicesTotal,
    representation_count: s.representationCount,
  };
}
