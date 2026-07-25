// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/registry нь Ring System · R1 — Үйлчилгээний нэгдсэн регистрийн
// бизнес логик: CPSV-AP үйлчилгээний паспорт, нотолгооны каталог ба ХУР
// mapping, once-only зөрчил илрүүлэгч, паспортын хувилбар + baseline delta,
// амьдралын үйл явдлын давхарга.

import { badRequest, conflict, internalCause } from '../../apperror/index.js';
import type {
  NewRegistryEvidence,
  NewRegistryLifeEvent,
  NewRegistryService,
  RegistryRepository,
} from '../../datasources/repositories/interface/registry.js';
import type {
  RegistryEvidence,
  RegistryLifeEvent,
  RegistryOnceOnlyViolation,
  RegistryOverview,
  RegistryService,
  RegistryServiceEvidence,
  RegistryServiceVersion,
} from '../../domain/registry.js';
import {
  eligibleProactivity,
  ProactivityInformation,
  ProactivityLevels,
  RegistryStatusArchived,
  RegistryStatusDraft,
  RegistryStatusPublished,
} from '../../domain/registry.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

/**
 * codePattern нь паспорт/нотолгоо/үйл явдлын кодын хэлбэр. Код нь ТОГТВОРТОЙ
 * таних тэмдэг (интеграци, тайлан, хуулийн иш татлагад хэрэглэгддэг) тул
 * зөвхөн том үсэг, тоо, доогуур зураас, зураас зөвшөөрнө.
 */
const codePattern = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

/** allowedChannels нь CPSV-AP-ийн Channel — Монголын нөхцөлд буулгасан. */
const allowedChannels = new Set(['office', 'e-mongolia', 'mobile', 'phone', 'post']);

/** allowedAssurance нь eIDAS (Reg. 910/2014 Art.8)-ийн гурван түвшин. */
const allowedAssurance = new Set(['low', 'substantial', 'high']);

/** allowedOutputType нь CPSV-AP-ийн Output толь (7 утга). */
const allowedOutputType = new Set([
  'Declaration',
  'Physical object',
  'Code',
  'Financial obligation',
  'Financial benefit',
  'Recognition',
  'Permit',
]);

/** Fulfilment горимууд — auto бол шууд олгогдоно, manual бол дараалалд орно. */
const FulfilmentAuto = 'auto';
const FulfilmentManual = 'manual';

/** Дээд хязгаарууд — утгагүй/хог өгөгдлөөс сэргийлнэ. */
const maxNameLen = 300;
const maxTextLen = 4000;
const maxDaysLimit = 3650; // 10 жил
const maxStepsLimit = 500;
const maxVolumeLimit = 100_000_000;
/** maxSLAHours — 1 жил. Үүнээс хэтэрсэн норм нь хог өгөгдөл. */
const maxSLAHours = 24 * 365;

/** ListFilter нь паспортын жагсаалтын шүүлтүүр (HTTP query-гээс). */
export interface ListFilter {
  status: string;
  authority: string;
  lifeEventId: string;
  proactivity: string;
  query: string;
}

/**
 * ServiceInput нь паспорт үүсгэх/засах оролт. `code` нь ЗӨВХӨН үүсгэх үед
 * хэрэглэгдэнэ — паспортын код өөрчлөгддөггүй (түүхэн мөрдөлт тасрахаас
 * сэргийлнэ).
 */
export interface ServiceInput {
  code: string;
  name: string;
  nameEn: string;
  description: string;
  authority: string;
  authorityOrgId: string | null;
  legalBasis: string;
  targetGroup: string;
  output: string;
  channels: string[];
  fee: number;
  maxDays: number;
  stepsCount: number;
  annualVolume: number;
  proactivity: string;
  lifeEventId: string | null;
  category: string;
  cofogCode: string;
  cofogLabel: string;
  mainActivity: string;
  sdgCode: string;
  processingTime: string;
  outputType: string;
  outputRefType: string;
  assuranceLevel: string;
  fulfilment: string;
  hasDiscretion: boolean;
  hasAssessment: boolean;
  slaHours: number;
  tacitApproval: boolean;
  online: boolean;
}

/** EvidenceLink нь паспортод нотолгоо холбох мөр. */
export interface EvidenceLink {
  evidenceId: string;
  required: boolean;
  fromCitizen: boolean;
  note: string;
}

/** EvidenceInput нь нотолгооны каталогийн бичлэг. */
export interface EvidenceInput {
  code: string;
  name: string;
  description: string;
  holderAgency: string;
  sourceSystem: string;
  inKhur: boolean;
  khurServiceCode: string;
}

/** LifeEventInput нь амьдралын/бизнесийн үйл явдлын бичлэг. */
export interface LifeEventInput {
  code: string;
  name: string;
  kind: string;
  description: string;
  leadAgency: string;
  euCode: string;
  enLabel: string;
  sortOrder: number;
}

/** PublishInput нь паспортыг нийтлэх (шинэ хувилбар үүсгэх) оролт. */
export interface PublishInput {
  changeNote: string;
  publishedBy: string | null;
}

/** OnceOnlyReport нь нэг үйлчилгээний once-only шалгалтын дүн. */
export interface OnceOnlyReport {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  /** citizenDocuments нь ИРГЭНЭЭС шаардаж буй нийт баримтын тоо. */
  citizenDocuments: number;
  /** violations нь тэдгээрээс ХУР-д АЛЬ ХЭДИЙН байгаа нь (=устгах боломжтой). */
  violations: RegistryServiceEvidence[];
  compliant: boolean;
  /** eligibleProactivity нь одоогийн зөрчлийн байдалд хүрч БОЛОХ дээд шат. */
  eligibleProactivity: string;
}

export interface RegistryUsecase {
  listServices(ctx: Ctx, filter: ListFilter): Promise<RegistryService[]>;
  /** publicCatalog нь ЗӨВХӨН нийтлэгдсэн паспортыг буцаана (иргэн рүү харсан). */
  publicCatalog(ctx: Ctx, filter: ListFilter): Promise<RegistryService[]>;
  /** publicService нь нийтлэгдээгүй паспортыг NotFound болгоно (ноорог гарахгүй). */
  publicService(ctx: Ctx, id: string): Promise<RegistryService>;
  getService(ctx: Ctx, id: string): Promise<RegistryService>;
  createService(ctx: Ctx, input: ServiceInput): Promise<RegistryService>;
  updateService(ctx: Ctx, id: string, input: ServiceInput): Promise<RegistryService>;
  deleteService(ctx: Ctx, id: string): Promise<void>;
  archiveService(ctx: Ctx, id: string): Promise<void>;

  setEvidences(ctx: Ctx, serviceId: string, list: EvidenceLink[]): Promise<RegistryService>;
  publish(ctx: Ctx, serviceId: string, input: PublishInput): Promise<RegistryServiceVersion>;
  listVersions(ctx: Ctx, serviceId: string): Promise<RegistryServiceVersion[]>;

  listEvidences(ctx: Ctx): Promise<RegistryEvidence[]>;
  createEvidence(ctx: Ctx, input: EvidenceInput): Promise<RegistryEvidence>;
  updateEvidence(ctx: Ctx, id: string, input: EvidenceInput): Promise<RegistryEvidence>;
  deleteEvidence(ctx: Ctx, id: string): Promise<void>;

  listLifeEvents(ctx: Ctx): Promise<RegistryLifeEvent[]>;
  createLifeEvent(ctx: Ctx, input: LifeEventInput): Promise<RegistryLifeEvent>;
  deleteLifeEvent(ctx: Ctx, id: string): Promise<void>;

  onceOnlyViolations(ctx: Ctx, authority: string): Promise<RegistryOnceOnlyViolation[]>;
  checkOnceOnly(ctx: Ctx, serviceId: string): Promise<OnceOnlyReport>;
  overview(ctx: Ctx): Promise<RegistryOverview>;
}

/** normalizeChannels нь сувгуудыг цэвэрлэж, давхардлыг арилгаж, шалгана. */
function normalizeChannels(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const c = raw.trim().toLowerCase();
    if (c === '') continue;
    if (!allowedChannels.has(c)) throw badRequest(`unknown channel: ${c}`);
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * validateService нь паспортын оролтыг шалгаж, ЦЭВЭРЛЭСЭН хувилбарыг буцаана.
 * withCode=false үед код шалгагдахгүй (засварын үед код өөрчлөгддөггүй).
 */
function validateService(input: ServiceInput, withCode: boolean): ServiceInput {
  const out: ServiceInput = {
    ...input,
    name: input.name.trim(),
    nameEn: input.nameEn.trim(),
    description: input.description.trim(),
    authority: input.authority.trim(),
    legalBasis: input.legalBasis.trim(),
    targetGroup: input.targetGroup.trim(),
    output: input.output.trim(),
  };

  if (withCode) {
    out.code = input.code.trim().toUpperCase();
    if (!codePattern.test(out.code)) {
      throw badRequest('code must be 2-64 chars of A-Z, 0-9, _ or -');
    }
  }
  if (out.name === '') throw badRequest('name is required');
  if (out.name.length > maxNameLen || out.nameEn.length > maxNameLen) {
    throw badRequest('name is too long');
  }
  if (out.description.length > maxTextLen || out.legalBasis.length > maxTextLen) {
    throw badRequest('text field is too long');
  }
  // Эрх бүхий байгууллага нь CPSV-AP-ийн ЦӨМ талбар: үүнгүй паспорт нь "далд"
  // үйлчилгээ хэвээр үлдэнэ.
  if (out.authority === '') throw badRequest('authority is required');
  if (out.fee < 0) throw badRequest('fee must not be negative');
  if (out.maxDays < 0 || out.maxDays > maxDaysLimit) throw badRequest('max_days is out of range');
  if (out.stepsCount < 0 || out.stepsCount > maxStepsLimit) {
    throw badRequest('steps_count is out of range');
  }
  if (out.annualVolume < 0 || out.annualVolume > maxVolumeLimit) {
    throw badRequest('annual_volume is out of range');
  }

  out.proactivity =
    input.proactivity.trim() === ''
      ? ProactivityInformation
      : input.proactivity.trim().toLowerCase();
  if (!ProactivityLevels.has(out.proactivity)) {
    throw badRequest(`unknown proactivity level: ${out.proactivity}`);
  }

  out.channels = normalizeChannels(input.channels);

  out.fulfilment =
    input.fulfilment.trim() === '' ? FulfilmentManual : input.fulfilment.trim().toLowerCase();
  if (out.fulfilment !== FulfilmentAuto && out.fulfilment !== FulfilmentManual) {
    throw badRequest(`unknown fulfilment mode: ${out.fulfilment}`);
  }

  // АВТОМАТЖУУЛАЛТЫН ЭРХ ЗҮЙН ШАЛГУУР (Германы VwVfG §35a-ийн загвар):
  // шийдвэрийг бүрэн автоматаар гаргах нь эрх бүхий этгээдэд ҮНЭЛЭХ ЭРХ
  // (Ermessen) ч, урьдчилсан нөхцөлд ҮНЭЛГЭЭНИЙ ЗАЙ (Beurteilungsspielraum) ч
  // байхгүй үед л зөвшөөрөгдөнө. Эс тэгвээс хүний оролцоо шаардах шийдвэр
  // чимээгүйхэн машинд шилжинэ.
  if (out.fulfilment === FulfilmentAuto && (out.hasDiscretion || out.hasAssessment)) {
    throw badRequest(
      'үнэлэх эрх эсвэл үнэлгээний зайтай үйлчилгээг автоматаар олгож болохгүй — ' +
        'эхлээд эдгээрийг арилгасан эсэхээ баталгаажуулна уу',
    );
  }

  out.assuranceLevel =
    input.assuranceLevel.trim() === '' ? 'substantial' : input.assuranceLevel.trim().toLowerCase();
  if (!allowedAssurance.has(out.assuranceLevel)) {
    throw badRequest(`unknown assurance level: ${out.assuranceLevel}`);
  }

  out.outputType = input.outputType.trim() === '' ? 'Declaration' : input.outputType.trim();
  if (!allowedOutputType.has(out.outputType)) {
    throw badRequest(`unknown output type: ${out.outputType}`);
  }

  if (out.slaHours < 0 || out.slaHours > maxSLAHours) throw badRequest('sla_hours is out of range');
  // Шууд олгогддог үйлчилгээнд хүлээх хугацаа утгагүй.
  if (out.fulfilment === FulfilmentAuto) out.slaHours = 0;

  out.category = input.category.trim();
  out.cofogCode = input.cofogCode.trim();
  out.cofogLabel = input.cofogLabel.trim();
  out.mainActivity = input.mainActivity.trim();
  out.sdgCode = input.sdgCode.trim().toUpperCase();
  out.processingTime = input.processingTime.trim().toUpperCase();
  out.outputRefType = input.outputRefType.trim().toLowerCase();
  return out;
}

/** toNewService нь цэвэрлэгдсэн оролтыг repository-ийн хэлбэр рүү хөрвүүлнэ. */
function toNewService(input: ServiceInput, status: string): NewRegistryService {
  return {
    code: input.code,
    name: input.name,
    nameEn: input.nameEn,
    description: input.description,
    authority: input.authority,
    authorityOrgId: input.authorityOrgId,
    legalBasis: input.legalBasis,
    targetGroup: input.targetGroup,
    output: input.output,
    channels: input.channels,
    fee: input.fee,
    maxDays: input.maxDays,
    stepsCount: input.stepsCount,
    annualVolume: input.annualVolume,
    proactivity: input.proactivity,
    status,
    lifeEventId: input.lifeEventId,
    category: input.category,
    cofogCode: input.cofogCode,
    cofogLabel: input.cofogLabel,
    mainActivity: input.mainActivity,
    sdgCode: input.sdgCode,
    processingTime: input.processingTime,
    outputType: input.outputType,
    outputRefType: input.outputRefType,
    assuranceLevel: input.assuranceLevel,
    fulfilment: input.fulfilment,
    hasDiscretion: input.hasDiscretion,
    hasAssessment: input.hasAssessment,
    slaHours: input.slaHours,
    tacitApproval: input.tacitApproval,
    online: input.online,
  };
}

/** validateEvidence нь нотолгооны оролтыг шалгаж цэвэрлэнэ. */
function validateEvidence(input: EvidenceInput, withCode: boolean): EvidenceInput {
  const out: EvidenceInput = {
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    holderAgency: input.holderAgency.trim(),
    sourceSystem: input.sourceSystem.trim(),
    khurServiceCode: input.khurServiceCode.trim(),
  };
  if (withCode) {
    out.code = input.code.trim().toUpperCase();
    if (!codePattern.test(out.code)) {
      throw badRequest('code must be 2-64 chars of A-Z, 0-9, _ or -');
    }
  }
  if (out.name === '') throw badRequest('name is required');
  if (out.name.length > maxNameLen) throw badRequest('name is too long');
  if (out.description.length > maxTextLen) throw badRequest('description is too long');
  // ХУР-д байгаа гэж тэмдэглэсэн бол АЛЬ лавлагаагаар авахыг заана — once-only
  // зөрчлийг ЗАСАХ заавар болно (зөвхөн илрүүлээд орхихгүй).
  if (out.inKhur && out.khurServiceCode === '') {
    throw badRequest('khur_service_code is required when in_khur is set');
  }
  return out;
}

class RegistryUsecaseImpl implements RegistryUsecase {
  constructor(private readonly repo: RegistryRepository) {}

  // ── Паспорт ───────────────────────────────────────────────────────────

  async listServices(ctx: Ctx, filter: ListFilter): Promise<RegistryService[]> {
    return await this.repo.listServices(ctx, { ...filter, publishedOnly: false });
  }

  async publicCatalog(ctx: Ctx, filter: ListFilter): Promise<RegistryService[]> {
    // publishedOnly-г ЭНД албадна — status query-гээр ноорог гуйхыг үл тоомсорлоно.
    return await this.repo.listServices(ctx, { ...filter, status: '', publishedOnly: true });
  }

  async getService(ctx: Ctx, id: string): Promise<RegistryService> {
    return await this.repo.getService(ctx, id);
  }

  async publicService(ctx: Ctx, id: string): Promise<RegistryService> {
    const svc = await this.repo.getService(ctx, id);
    // Нийтлэгдээгүй паспорт нь иргэнд ОГТ БАЙХГҮЙ мэт харагдана.
    if (svc.status !== RegistryStatusPublished) {
      throw badRequest('service not found');
    }
    return svc;
  }

  async createService(ctx: Ctx, input: ServiceInput): Promise<RegistryService> {
    const clean = validateService(input, true);
    // Шинэ паспорт ҮРГЭЛЖ ноорогоор эхэлнэ — нийтлэлт нь тусдаа, аудитлагдсан
    // үйлдэл (publish) бөгөөд тэнд л хувилбар үүснэ.
    return await this.repo.createService(ctx, toNewService(clean, RegistryStatusDraft));
  }

  async updateService(ctx: Ctx, id: string, input: ServiceInput): Promise<RegistryService> {
    const clean = validateService(input, false);
    const cur = await this.repo.getService(ctx, id);
    if (cur.status === RegistryStatusArchived) {
      throw conflict('archived service cannot be edited');
    }
    return await this.repo.updateService(ctx, id, toNewService(clean, cur.status));
  }

  async deleteService(ctx: Ctx, id: string): Promise<void> {
    const cur = await this.repo.getService(ctx, id);
    // Нийтлэгдсэн паспортыг устгахыг хориглоно — түүхэн мөрдөлт (хувилбар,
    // delta, once-only статистик) тасарна. Оронд нь архивлана.
    if (cur.status === RegistryStatusPublished) {
      throw conflict('published service cannot be deleted; archive it instead');
    }
    await this.repo.deleteService(ctx, id);
  }

  async archiveService(ctx: Ctx, id: string): Promise<void> {
    await this.repo.setServiceStatus(ctx, id, RegistryStatusArchived);
    // Архивласан үйлчилгээг иргэний каталогоос ч ГАРГАНА — эс тэгвээс регистрт
    // "хэрэглэхээ больсон" гэж бичигдсэн атал иргэн хүсэлт гаргасаар байх
    // зөрүү үүснэ.
    await this.repo.withdrawFromGov(ctx, id);
  }

  // ── Нотолгооны холбоос ────────────────────────────────────────────────

  async setEvidences(ctx: Ctx, serviceId: string, list: EvidenceLink[]): Promise<RegistryService> {
    const seen = new Set<string>();
    const out: EvidenceLink[] = [];
    for (const l of list) {
      const id = l.evidenceId.trim();
      if (id === '') throw badRequest('evidence id is required');
      if (seen.has(id)) throw badRequest(`duplicate evidence: ${id}`);
      seen.add(id);
      const note = l.note.trim();
      if (note.length > maxTextLen) throw badRequest('note is too long');
      out.push({ evidenceId: id, required: l.required, fromCitizen: l.fromCitizen, note });
    }
    await this.repo.setServiceEvidences(ctx, serviceId, out);
    return await this.repo.getService(ctx, serviceId);
  }

  // ── Once-only ─────────────────────────────────────────────────────────

  async checkOnceOnly(ctx: Ctx, serviceId: string): Promise<OnceOnlyReport> {
    const svc = await this.repo.getService(ctx, serviceId);
    const violations: RegistryServiceEvidence[] = [];
    let citizenDocuments = 0;
    for (const e of svc.evidences) {
      if (!e.fromCitizen) continue;
      citizenDocuments += 1;
      // Иргэнээс шаардаж байгаа АТАЛ ХУР-д аль хэдийн байгаа = ЗӨРЧИЛ.
      if (e.inKhur) violations.push(e);
    }
    return {
      serviceId: svc.id,
      serviceCode: svc.code,
      serviceName: svc.name,
      citizenDocuments,
      violations,
      compliant: violations.length === 0,
      eligibleProactivity: eligibleProactivity(svc.proactivity, violations.length > 0),
    };
  }

  async onceOnlyViolations(ctx: Ctx, authority: string): Promise<RegistryOnceOnlyViolation[]> {
    return await this.repo.onceOnlyViolations(ctx, authority.trim());
  }

  // ── Нийтлэлт (хувилбар + baseline delta) ──────────────────────────────

  /**
   * publish нь паспортын одоогийн төлөвийг шинэ хувилбар болгон бэхэлж, түүнийг
   * baseline-тай харьцуулсан delta-тай хамт хадгална. ЭХНИЙ нийтлэлт нь өөрөө
   * baseline болно — дараагийн бүх сайжралт үүнтэй харьцуулагдана.
   */
  async publish(ctx: Ctx, serviceId: string, input: PublishInput): Promise<RegistryServiceVersion> {
    const svc = await this.repo.getService(ctx, serviceId);
    if (svc.status === RegistryStatusArchived) {
      throw conflict('archived service cannot be published');
    }

    // Зарласан проактив байдлын шатыг БОДИТ once-only байдалтай тулгана —
    // регистр өөрөө худал мэдээлэл агуулахаас сэргийлнэ.
    const report = await this.checkOnceOnly(ctx, serviceId);
    if (report.eligibleProactivity !== svc.proactivity) {
      throw conflict(
        `cannot publish as '${svc.proactivity}': service still requests data already available in KHUR`,
      );
    }

    const documentsCount = await this.repo.countCitizenDocuments(ctx, serviceId);
    const base = await this.repo.baselineVersion(ctx, serviceId);

    // СӨРӨГ delta = сайжралт (алхам/баримт/хугацаа буурсан). Baseline байхгүй
    // бол энэ мөр өөрөө baseline (delta бүгд 0).
    const version = await this.repo.publishVersion(ctx, {
      serviceId,
      changeNote: input.changeNote.trim(),
      isBaseline: base === null,
      stepsCount: svc.stepsCount,
      documentsCount,
      maxDays: svc.maxDays,
      fee: svc.fee,
      deltaSteps: base === null ? 0 : svc.stepsCount - base.stepsCount,
      deltaDocuments: base === null ? 0 : documentsCount - base.documentsCount,
      deltaDays: base === null ? 0 : svc.maxDays - base.maxDays,
      deltaFee: base === null ? 0 : svc.fee - base.fee,
      publishedBy: input.publishedBy,
      // Snapshot — нийтлэх мөчийн паспортын бүтэн хуулбар (маргаангүй түүх).
      snapshot: serviceSnapshot(svc),
    });

    // Нийтлэгдсэн паспортыг иргэний порталын ажлын каталог руу буулгана.
    // Алдааг ЗАЛГИХГҮЙ: проекц амжилтгүй бол регистрт нийтлэгдсэн атлаа иргэнд
    // харагдахгүй "чимээгүй зөрүү" үүсэх тул дуудагчид мэдэгдэнэ. Хувилбарын
    // мөр аль хэдийн бичигдсэн тул дахин publish дуудахад проекц дахин
    // оролдогдоно.
    await this.repo.projectToGov(ctx, serviceId);
    return version;
  }

  async listVersions(ctx: Ctx, serviceId: string): Promise<RegistryServiceVersion[]> {
    return await this.repo.listVersions(ctx, serviceId);
  }

  // ── Нотолгооны каталог ────────────────────────────────────────────────

  async listEvidences(ctx: Ctx): Promise<RegistryEvidence[]> {
    return await this.repo.listEvidences(ctx);
  }

  async createEvidence(ctx: Ctx, input: EvidenceInput): Promise<RegistryEvidence> {
    const clean = validateEvidence(input, true);
    return await this.repo.createEvidence(ctx, toNewEvidence(clean));
  }

  async updateEvidence(ctx: Ctx, id: string, input: EvidenceInput): Promise<RegistryEvidence> {
    const clean = validateEvidence(input, false);
    return await this.repo.updateEvidence(ctx, id, toNewEvidence(clean));
  }

  async deleteEvidence(ctx: Ctx, id: string): Promise<void> {
    await this.repo.deleteEvidence(ctx, id);
  }

  // ── Амьдралын үйл явдал ───────────────────────────────────────────────

  async listLifeEvents(ctx: Ctx): Promise<RegistryLifeEvent[]> {
    return await this.repo.listLifeEvents(ctx);
  }

  async createLifeEvent(ctx: Ctx, input: LifeEventInput): Promise<RegistryLifeEvent> {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const kind = input.kind.trim().toLowerCase() === 'business' ? 'business' : 'life';
    if (!codePattern.test(code)) {
      throw badRequest('code must be 2-64 chars of A-Z, 0-9, _ or -');
    }
    if (name === '') throw badRequest('name is required');
    if (name.length > maxNameLen) throw badRequest('name is too long');

    const event: NewRegistryLifeEvent = {
      code,
      name,
      kind,
      description: input.description.trim(),
      leadAgency: input.leadAgency.trim(),
      euCode: input.euCode.trim().toUpperCase(),
      enLabel: input.enLabel.trim(),
      sortOrder: input.sortOrder,
    };
    return await this.repo.createLifeEvent(ctx, event);
  }

  async deleteLifeEvent(ctx: Ctx, id: string): Promise<void> {
    await this.repo.deleteLifeEvent(ctx, id);
  }

  async overview(ctx: Ctx): Promise<RegistryOverview> {
    return await this.repo.overview(ctx);
  }
}

/** toNewEvidence нь цэвэрлэгдсэн оролтыг repository-ийн хэлбэр болгоно. */
function toNewEvidence(input: EvidenceInput): NewRegistryEvidence {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    holderAgency: input.holderAgency,
    sourceSystem: input.sourceSystem,
    inKhur: input.inKhur,
    khurServiceCode: input.khurServiceCode,
  };
}

/**
 * serviceSnapshot нь паспортыг JSONB-д хадгалахуйц энгийн объект болгоно.
 * Огноог ISO мөр болгоно — snapshot нь МАРГААНГҮЙ түүх тул давхар хөрвүүлэлтэд
 * найдахгүй, ил бичнэ.
 */
function serviceSnapshot(svc: RegistryService): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(svc)) as Record<string, unknown>;
  } catch (err) {
    throw internalCause(err);
  }
}

export const newRegistryUsecase = (repo: RegistryRepository): RegistryUsecase =>
  new RegistryUsecaseImpl(repo);
