// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type {
  RegistryEvidence,
  RegistryLifeEvent,
  RegistryOnceOnlyViolation,
  RegistryOverview,
  RegistryService,
  RegistryServiceEvidence,
  RegistryServiceVersion,
} from '../../../domain/registry.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/** RegistryFilter нь паспортын жагсаалтын шүүлтүүр. Хоосон талбар = шүүхгүй. */
export interface RegistryFilter {
  /** draft | published | archived */
  status: string;
  authority: string;
  lifeEventId: string;
  proactivity: string;
  /** query нь нэр/код дотор хайна. */
  query: string;
  /**
   * publishedOnly нь НИЙТИЙН каталогийн уншилтад ашиглагдана — status-аас үл
   * хамааран зөвхөн published мөрүүдийг буцаана.
   */
  publishedOnly: boolean;
}

/** NewRegistryService нь паспорт үүсгэх/шинэчлэх талбарууд (id/огноогүй). */
export type NewRegistryService = Omit<
  RegistryService,
  'id' | 'version' | 'publishedAt' | 'createdAt' | 'updatedAt' | 'evidences'
>;

/** NewRegistryEvidence нь нотолгооны каталогийн бичлэг (id/огноогүй). */
export type NewRegistryEvidence = Omit<RegistryEvidence, 'id' | 'createdAt' | 'updatedAt'>;

/** NewRegistryLifeEvent нь амьдралын үйл явдлын бичлэг (id/огноогүй). */
export type NewRegistryLifeEvent = Omit<RegistryLifeEvent, 'id' | 'createdAt'>;

/** NewRegistryVersion нь нийтлэх үед бичигдэх хувилбарын мөр. */
export type NewRegistryVersion = Omit<RegistryServiceVersion, 'id' | 'version' | 'publishedAt'>;

/**
 * RegistryRepository нь Ring R1 — үйлчилгээний нэгдсэн регистрийн gateway.
 * gateway/relay-ийн адил RLS-ГҮЙ: энэ нь байгууллагын мастер өгөгдөл бөгөөд
 * хамгаалалт нь `registry.view` / `registry.manage` эрхээр HTTP давхаргад.
 */
export interface RegistryRepository {
  // ── Паспорт ─────────────────────────────────────────────────────────────
  listServices(ctx: Ctx, filter: RegistryFilter): Promise<RegistryService[]>;
  /** getService нь нотолгооны жагсаалттай нь ХАМТ буцаана. */
  getService(ctx: Ctx, id: string): Promise<RegistryService>;
  createService(ctx: Ctx, input: NewRegistryService): Promise<RegistryService>;
  updateService(ctx: Ctx, id: string, input: NewRegistryService): Promise<RegistryService>;
  setServiceStatus(ctx: Ctx, id: string, status: string): Promise<void>;
  deleteService(ctx: Ctx, id: string): Promise<void>;

  // ── Паспорт ↔ нотолгоо ──────────────────────────────────────────────────
  /** setServiceEvidences нь бүрэн жагсаалтыг НЭГ транзакцид солино. */
  setServiceEvidences(
    ctx: Ctx,
    serviceId: string,
    list: { evidenceId: string; required: boolean; fromCitizen: boolean; note: string }[],
  ): Promise<void>;
  /** countCitizenDocuments нь ИРГЭНЭЭС шаардаж буй баримтын тоо. */
  countCitizenDocuments(ctx: Ctx, serviceId: string): Promise<number>;

  // ── Хувилбар ────────────────────────────────────────────────────────────
  listVersions(ctx: Ctx, serviceId: string): Promise<RegistryServiceVersion[]>;
  /** baselineVersion нь baseline мөрийг буцаана; байхгүй бол null. */
  baselineVersion(ctx: Ctx, serviceId: string): Promise<RegistryServiceVersion | null>;
  /** publishVersion нь хувилбар нэмж, паспортын version/status-ыг НЭГ транзакцид шинэчилнэ. */
  publishVersion(ctx: Ctx, input: NewRegistryVersion): Promise<RegistryServiceVersion>;

  // ── Ажлын каталог руу проекц ────────────────────────────────────────────
  /** projectToGov нь паспортыг иргэний порталын каталог руу буулгана (upsert). */
  projectToGov(ctx: Ctx, serviceId: string): Promise<void>;
  /** withdrawFromGov нь архивлагдсан паспортын ажлын үйлчилгээг УНТРААНА (устгахгүй). */
  withdrawFromGov(ctx: Ctx, serviceId: string): Promise<void>;

  // ── Нотолгооны каталог ──────────────────────────────────────────────────
  listEvidences(ctx: Ctx): Promise<RegistryEvidence[]>;
  createEvidence(ctx: Ctx, input: NewRegistryEvidence): Promise<RegistryEvidence>;
  updateEvidence(ctx: Ctx, id: string, input: NewRegistryEvidence): Promise<RegistryEvidence>;
  deleteEvidence(ctx: Ctx, id: string): Promise<void>;

  // ── Амьдралын үйл явдал ─────────────────────────────────────────────────
  listLifeEvents(ctx: Ctx): Promise<RegistryLifeEvent[]>;
  createLifeEvent(ctx: Ctx, input: NewRegistryLifeEvent): Promise<RegistryLifeEvent>;
  deleteLifeEvent(ctx: Ctx, id: string): Promise<void>;

  // ── Once-only + нэгтгэл ─────────────────────────────────────────────────
  onceOnlyViolations(ctx: Ctx, authority: string): Promise<RegistryOnceOnlyViolation[]>;
  overview(ctx: Ctx): Promise<RegistryOverview>;
}

export type { RegistryServiceEvidence };
