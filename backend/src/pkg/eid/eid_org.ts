// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// eID Mongolia RP client-ийн БАЙГУУЛЛАГЫН ТӨЛӨӨЛЛИЙН хэсэг: иргэн ямар
// байгууллагыг төлөөлж чадах, тэдгээрийн гарын үсэг зурагчид, латин нэр.
//
//   GET    /v3/organization/representations/etsi/{personEtsi}
//   POST   /v3/organization/representations/etsi/{personEtsi}
//   DELETE /v3/organization/representations/etsi/{personEtsi}/{orgRegister}
//   GET    /v3/organization/signers/{orgRegister}/etsi/{actingPersonEtsi}
//   POST   /v3/organization/signers/{orgRegister}/etsi/{actingPersonEtsi}
//   DELETE /v3/organization/signers/{orgRegister}/etsi/{actingPersonEtsi}?signer=
//   POST   /v3/organization/signers/{orgRegister}/etsi/{acting}/resend?signer=
//   PUT    /v3/organization/name-latin/{orgRegister}/etsi/{actingPersonEtsi}
//
// ЭРХИЙН ГЭРЭЭ: 403 нь "энэ байгууллагыг төлөөлөх эрхгүй" (ErrNotRepresentative)
// — эрх бүхий эх сурвалж нь УЛСЫН БҮРТГЭЛ (eidmongolia талд шалгагдана), энэ
// template хэзээ ч өөрөө "төлөөлөгч эсэх"-ийг шийддэггүй.

import { parseJSON, snippet, type EidRequester } from './transport.js';

/**
 * ErrNotRepresentative нь иргэн тухайн байгууллагыг төлөөлөх эрхгүй (403) үед
 * буцна. Дуудагч үүнийг цэвэр 403 Forbidden болгож буулгана.
 */
export class ErrNotRepresentative extends Error {
  constructor() {
    super('eid: not authorized to represent this organization');
    this.name = 'ErrNotRepresentative';
  }
}

/**
 * ErrSignerNotEnrolled нь нэмэх гэсэн иргэн eID-д бүртгэлгүй (РД олдсонгүй,
 * 404) үед буцна. Гарын үсэг зурахад eID шаардлагатай.
 */
export class ErrSignerNotEnrolled extends Error {
  constructor() {
    super('eid: signer is not enrolled in eID');
    this.name = 'ErrSignerNotEnrolled';
  }
}

/**
 * Representation нь иргэний төлөөлж чадах НЭГ байгууллага. validTo нь null бол
 * хугацаагүй.
 */
export interface Representation {
  /** NTRMN-... */
  orgEtsi: string;
  /** улсын бүртгэлийн дугаар */
  orgRegister: string;
  /** кирилл нэр */
  orgName: string;
  /** латин нэр (сонголттой) */
  orgNameEn: string;
  /** ж: Гүйцэтгэх захирал */
  role: string;
  /** ADMIN | MANAGER */
  rightType: string;
  validFrom: Date | null;
  validTo: Date | null;
}

/**
 * OrgAffiliate нь байгууллагыг төлөөлж болох эрх бүхий этгээд (улсын
 * бүртгэлээс). regNo нь хувь хүний РД; eidmongolia иргэний РД-г энэ жагсаалттай
 * тааруулж эрхийг баталгаажуулна. kind (CEO|FOUNDER|STAKEHOLDER) нь rightType-г
 * тодорхойлно.
 */
export interface OrgAffiliate {
  regNo: string;
  role?: string;
  kind?: string;
}

/**
 * AddRepresentationInput нь XYP-ээс баталгаажсан байгууллагын мэдээлэл + эрх
 * бүхий этгээдийн жагсаалт.
 */
export interface AddRepresentationInput {
  orgRegister: string;
  orgName: string;
  orgNameEn: string;
  affiliates: OrgAffiliate[];
}

/** Signer нь байгууллагыг төлөөлж / гарын үсэг зурж чадах нэг иргэн. */
export interface Signer {
  personEtsi: string;
  regNo: string;
  name: string;
  nameEn: string;
  role: string;
  /** ADMIN | MANAGER */
  rightType: string;
  /** ACTIVE | PENDING (sign-push баталгаажуулалт хүлээж буй) */
  status: string;
  source: string;
  /** нэвтэрсэн хэрэглэгч өөрөө эсэх */
  self: boolean;
}

/**
 * OrgConfirmation нь MANAGER нэмэхэд тэр хүн рүү илгээгдсэн eID sign-push
 * баталгаажуулалтын session — тэр хүн утсаараа PIN-ээ зурж зөвшөөрөх хүртэл
 * төлөөлөл нь PENDING (хүчингүй) хэвээр.
 */
export interface OrgConfirmation {
  orgRegister: string;
  orgName: string;
  signerEtsi: string;
  signerRegNo: string;
  sessionId: string;
}

/** SignersResult нь гарын үсэг зурагчид + хүлээгдэж буй sign-push баталгаажуулалт. */
export interface SignersResult {
  signers: Signer[];
  pendingConfirmation: OrgConfirmation | null;
}

/**
 * AddSignerInput нь шинэ гарын үсэг зурагчийн мэдээлэл. Нэмэгдэх зурагчийн эрх
 * нь ҮРГЭЛЖ MANAGER (eidmongolia талд шийдэгдэнэ) тул rightType дамжуулахгүй.
 */
export interface AddSignerInput {
  signerRegNo: string;
  role: string;
}

/** RepresentationsWire нь representations хариуны сүлжээний хэлбэр. */
interface RepresentationsWire {
  representations?: {
    orgEtsi?: string;
    orgRegister?: string;
    orgName?: string;
    orgNameEn?: string;
    role?: string;
    rightType?: string;
    validFrom?: string | null;
    validTo?: string | null;
  }[];
}

interface SignersWire {
  signers?: {
    personEtsi?: string;
    regNo?: string;
    name?: string;
    nameEn?: string;
    role?: string;
    rightType?: string;
    status?: string;
    source?: string;
    self?: boolean;
  }[];
  pendingConfirmation?: {
    orgRegister?: string;
    orgName?: string;
    signerEtsi?: string;
    signerRegNo?: string;
    sessionId?: string;
  } | null;
}

/** optDate нь ISO мөрийг Date болгоно; байхгүй/буруу бол null. */
function optDate(v: string | null | undefined): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** parseRepresentations нь representations хариуг задлана. */
export function parseRepresentations(raw: string): Representation[] {
  const out = parseJSON<RepresentationsWire>(raw, 'eid representations');
  return (out.representations ?? []).map((r) => ({
    orgEtsi: r.orgEtsi ?? '',
    orgRegister: r.orgRegister ?? '',
    orgName: r.orgName ?? '',
    orgNameEn: r.orgNameEn ?? '',
    role: r.role ?? '',
    rightType: r.rightType ?? '',
    validFrom: optDate(r.validFrom),
    validTo: optDate(r.validTo),
  }));
}

/** parseSignersResult нь signers хариуг (жагсаалт + pendingConfirmation) задлана. */
export function parseSignersResult(raw: string): SignersResult {
  const out = parseJSON<SignersWire>(raw, 'eid signers');
  const signers: Signer[] = (out.signers ?? []).map((s) => ({
    personEtsi: s.personEtsi ?? '',
    regNo: s.regNo ?? '',
    name: s.name ?? '',
    nameEn: s.nameEn ?? '',
    role: s.role ?? '',
    rightType: s.rightType ?? '',
    status: s.status ?? '',
    source: s.source ?? '',
    self: s.self ?? false,
  }));
  const pc = out.pendingConfirmation;
  return {
    signers,
    pendingConfirmation:
      pc === undefined || pc === null
        ? null
        : {
            orgRegister: pc.orgRegister ?? '',
            orgName: pc.orgName ?? '',
            signerEtsi: pc.signerEtsi ?? '',
            signerRegNo: pc.signerRegNo ?? '',
            sessionId: pc.sessionId ?? '',
          },
  };
}

const esc = (s: string): string => encodeURIComponent(s.trim());

/** repsPath нь иргэний төлөөллийн замыг угсарна. */
function repsPath(personEtsi: string): string {
  if (personEtsi.trim() === '') throw new Error('eid: empty personEtsi');
  return `/organization/representations/etsi/${esc(personEtsi)}`;
}

/**
 * representations нь тухайн хүн (personEtsi = PNOMN-<civil_id>)-ий төлөөлж
 * чадах идэвхтэй байгууллагуудыг буцаана. 404 (хүн олдсонгүй / байгууллага
 * төлөөлдөггүй) нь АЛДАА БИШ — хоосон жагсаалт.
 */
export async function representations(
  http: EidRequester,
  personEtsi: string,
  signal?: AbortSignal,
): Promise<Representation[]> {
  const { raw, status } = await http.get(repsPath(personEtsi), signal);
  if (status === 404) return [];
  if (status >= 300) throw new Error(`eid representations: status ${status}: ${snippet(raw)}`);
  return parseRepresentations(raw);
}

/**
 * addRepresentation нь улсын бүртгэлээс (XYP) баталгаажуулсан байгууллагыг
 * иргэнд холбоно. Иргэний РД нь affiliates жагсаалтад байвал л төлөөлөл
 * нэмэгдэнэ — эс бөгөөс ErrNotRepresentative.
 */
export async function addRepresentation(
  http: EidRequester,
  personEtsi: string,
  input: AddRepresentationInput,
  signal?: AbortSignal,
): Promise<Representation[]> {
  const path = repsPath(personEtsi);
  if (input.orgRegister.trim() === '') throw new Error('eid: empty orgRegister');
  const body = {
    orgRegister: input.orgRegister.trim(),
    orgName: input.orgName.trim(),
    ...(input.orgNameEn.trim() === '' ? {} : { orgNameEn: input.orgNameEn.trim() }),
    affiliates: input.affiliates.map((a) => ({
      regNo: a.regNo,
      ...(a.role === undefined || a.role === '' ? {} : { role: a.role }),
      ...(a.kind === undefined || a.kind === '' ? {} : { kind: a.kind }),
    })),
  };
  const { raw, status } = await http.post(path, body, signal);
  if (status === 403) throw new ErrNotRepresentative();
  if (status >= 300) throw new Error(`eid add representation: status ${status}: ${snippet(raw)}`);
  return parseRepresentations(raw);
}

/** removeRepresentation нь иргэн өөрийн байгууллагын төлөөллөө цуцлана. */
export async function removeRepresentation(
  http: EidRequester,
  personEtsi: string,
  orgRegister: string,
  signal?: AbortSignal,
): Promise<Representation[]> {
  if (orgRegister.trim() === '') throw new Error('eid: empty personEtsi/orgRegister');
  const path = `${repsPath(personEtsi)}/${esc(orgRegister)}`;
  const { raw, status } = await http.del(path, signal);
  if (status === 403) throw new ErrNotRepresentative();
  if (status >= 300) throw new Error(`eid unlink: status ${status}: ${snippet(raw)}`);
  return parseRepresentations(raw);
}

/**
 * signersPath нь /organization/signers/{orgRegister}/etsi/{actingPersonEtsi}
 * замыг угсарна. signer хоосон биш бол `?signer=` query нэмнэ.
 */
function signersPath(orgRegister: string, actingPersonEtsi: string, signer = ''): string {
  if (orgRegister.trim() === '' || actingPersonEtsi.trim() === '') {
    throw new Error('eid: empty orgRegister/actingPersonEtsi');
  }
  const path = `/organization/signers/${esc(orgRegister)}/etsi/${esc(actingPersonEtsi)}`;
  return signer === '' ? path : `${path}?signer=${encodeURIComponent(signer)}`;
}

/**
 * orgSigners нь байгууллагын гарын үсэг зурагчдыг буцаана. actingPersonEtsi нь
 * тухайн байгууллагын төлөөлөгч байх ЁСТОЙ (эс бол ErrNotRepresentative).
 */
export async function orgSigners(
  http: EidRequester,
  orgRegister: string,
  actingPersonEtsi: string,
  signal?: AbortSignal,
): Promise<Signer[]> {
  const { raw, status } = await http.get(signersPath(orgRegister, actingPersonEtsi), signal);
  if (status === 403) throw new ErrNotRepresentative();
  if (status >= 300) throw new Error(`eid signers: status ${status}: ${snippet(raw)}`);
  return parseSignersResult(raw).signers;
}

/**
 * addSigner нь байгууллагад өөр eID иргэнийг (РД) гарын үсэг зурах эрхтэй
 * (MANAGER) төлөөлөгч болгож нэмнэ. Тэр хүн рүү sign-push илгээж, PENDING
 * төлөөлөл үүсгэнэ.
 */
export async function addSigner(
  http: EidRequester,
  orgRegister: string,
  actingPersonEtsi: string,
  input: AddSignerInput,
  signal?: AbortSignal,
): Promise<SignersResult> {
  const body = {
    signerRegNo: input.signerRegNo.trim(),
    ...(input.role.trim() === '' ? {} : { role: input.role.trim() }),
  };
  const { raw, status } = await http.post(signersPath(orgRegister, actingPersonEtsi), body, signal);
  if (status === 403) throw new ErrNotRepresentative();
  if (status === 404) throw new ErrSignerNotEnrolled();
  if (status >= 300) throw new Error(`eid add signer: status ${status}: ${snippet(raw)}`);
  return parseSignersResult(raw);
}

/** removeSigner нь байгууллагаас гарын үсэг зурагчийг (РД) хасна. */
export async function removeSigner(
  http: EidRequester,
  orgRegister: string,
  actingPersonEtsi: string,
  signerRegNo: string,
  signal?: AbortSignal,
): Promise<Signer[]> {
  const path = signersPath(orgRegister, actingPersonEtsi, signerRegNo.trim());
  const { raw, status } = await http.del(path, signal);
  if (status === 403) throw new ErrNotRepresentative();
  if (status >= 300) throw new Error(`eid remove signer: status ${status}: ${snippet(raw)}`);
  return parseSignersResult(raw).signers;
}

/**
 * resendSigner нь баталгаажаагүй (PENDING) гарын үсэг зурагч руу sign-push-ийг
 * дахин илгээнэ.
 */
export async function resendSigner(
  http: EidRequester,
  orgRegister: string,
  actingPersonEtsi: string,
  signerRegNo: string,
  signal?: AbortSignal,
): Promise<SignersResult> {
  if (orgRegister.trim() === '' || actingPersonEtsi.trim() === '') {
    throw new Error('eid: empty orgRegister/actingPersonEtsi');
  }
  if (signerRegNo.trim() === '') throw new Error('eid: empty signerRegNo');
  const path =
    `/organization/signers/${esc(orgRegister)}/etsi/${esc(actingPersonEtsi)}/resend` +
    `?signer=${encodeURIComponent(signerRegNo.trim())}`;
  const { raw, status } = await http.post(path, undefined, signal);
  if (status === 403) throw new ErrNotRepresentative();
  if (status === 404) throw new ErrSignerNotEnrolled();
  if (status >= 300) throw new Error(`eid resend signer: status ${status}: ${snippet(raw)}`);
  return parseSignersResult(raw);
}

/** updateOrgNameLatin нь байгууллагын латин нэрийг засна (зөвхөн ADMIN). */
export async function updateOrgNameLatin(
  http: EidRequester,
  orgRegister: string,
  actingPersonEtsi: string,
  nameLatin: string,
  signal?: AbortSignal,
): Promise<Representation[]> {
  if (orgRegister.trim() === '' || actingPersonEtsi.trim() === '') {
    throw new Error('eid: empty orgRegister/actingPersonEtsi');
  }
  const path = `/organization/name-latin/${esc(orgRegister)}/etsi/${esc(actingPersonEtsi)}`;
  const { raw, status } = await http.put(path, { nameLatin: nameLatin.trim() }, signal);
  if (status === 403) throw new ErrNotRepresentative();
  if (status >= 300) {
    throw new Error(`eid update org name-latin: status ${status}: ${snippet(raw)}`);
  }
  return parseRepresentations(raw);
}
