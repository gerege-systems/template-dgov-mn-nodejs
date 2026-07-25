// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type {
  GovAppointment,
  GovApplication,
  GovApplicationEvent,
  GovLifeEvent,
  GovNotification,
  GovOverview,
  GovPayment,
  GovQueueFilter,
  GovQueueStats,
  GovReference,
  GovService,
} from '../../../domain/gov.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/** NewGovApplication нь хүсэлт үүсгэхэд шаардлагатай талбарууд. */
export interface NewGovApplication {
  userId: string;
  serviceId: string | null;
  serviceCode: string;
  serviceName: string;
  referenceNo: string;
  status: string;
  result: string;
  note: string;
  payload: Record<string, unknown> | null;
  dueAt: Date | null;
  decidedAt: Date | null;
  decisionNote: string;
  tacit: boolean;
}

/** NewGovReference нь олгогдох лавлагаа. */
export interface NewGovReference {
  userId: string;
  type: string;
  title: string;
  referenceNo: string;
  status: string;
  validUntil: Date | null;
  data: Record<string, unknown> | null;
}

/** NewGovNotification нь иргэнд илгээх мэдэгдэл. */
export interface NewGovNotification {
  userId: string;
  title: string;
  body: string;
  category: string;
}

/** NewGovAppointment нь захиалагдах цаг. */
export interface NewGovAppointment {
  userId: string;
  serviceId: string | null;
  serviceName: string;
  agency: string;
  location: string;
  scheduledAt: Date;
  status: string;
  note: string;
}

/** GovDecisionInput нь менежерийн шийдвэрийн бүрэн багц. */
export interface GovDecisionInput {
  applicationId: string;
  officerId: string;
  /** target нь очих төлөв (completed | approved | rejected). */
  target: string;
  result: string;
  note: string;
  outputRef: NewGovReference | null;
  notify: Omit<NewGovNotification, 'userId'> | null;
}

/** NewGovApplicationEvent нь timeline-д нэмэгдэх бичлэг. */
export interface NewGovApplicationEvent {
  applicationId: string;
  actorId: string | null;
  actorRole: string;
  fromStatus: string;
  toStatus: string;
  type: string;
  detail: string;
}

/**
 * GovRepository нь иргэний порталын gateway.
 *
 * gov_services нь НИЙТИЙН каталог (RLS-гүй лавлах); бусад хүснэгтүүд нь
 * хэрэглэгч-тус-бүрийн тул ХОЁР давхар хамгаалалттай: query бүр user_id-гаар ИЛ
 * шүүгдэхээс гадна RLS транзакцид identity тавигдана (defense-in-depth).
 */
export interface GovRepository {
  // ── Каталог ───────────────────────────────────────────────────────────
  listServices(ctx: Ctx): Promise<GovService[]>;
  getService(ctx: Ctx, id: string): Promise<GovService>;
  listLifeEvents(ctx: Ctx): Promise<GovLifeEvent[]>;

  // ── Хүсэлт (иргэн) ────────────────────────────────────────────────────
  listApplications(ctx: Ctx, userId: string): Promise<GovApplication[]>;
  getApplication(ctx: Ctx, userId: string, id: string): Promise<GovApplication>;
  createApplication(ctx: Ctx, input: NewGovApplication): Promise<GovApplication>;
  setApplicationStatus(ctx: Ctx, userId: string, id: string, status: string): Promise<void>;
  /**
   * createApplicationWithOutput нь AUTO горимын үйлчилгээг НЭГ ТРАНЗАКЦИД
   * биелүүлнэ: хүсэлт (completed) + лавлагаа + мэдэгдэл + timeline. Аль нэг нь
   * бүтэлгүйтвэл БҮГД буцна — иргэнд "олгогдсон" гэж харагдаад лавлагаа нь
   * байхгүй байх завсрын төлөв үүсэхээс сэргийлнэ.
   */
  createApplicationWithOutput(
    ctx: Ctx,
    app: NewGovApplication,
    ref: NewGovReference | null,
    notify: NewGovNotification | null,
  ): Promise<{ application: GovApplication; reference: GovReference | null }>;

  // ── Хүсэлт (менежер) ──────────────────────────────────────────────────
  queueStats(ctx: Ctx, officerId: string): Promise<GovQueueStats>;
  listQueue(ctx: Ctx, filter: GovQueueFilter): Promise<GovApplication[]>;
  getApplicationAny(ctx: Ctx, id: string): Promise<GovApplication>;
  /** assignApplication нь зэрэг ирсэн 2 дахь оролдлогод Conflict өгнө. */
  assignApplication(ctx: Ctx, id: string, officerId: string): Promise<GovApplication>;
  decideApplication(ctx: Ctx, input: GovDecisionInput): Promise<GovApplication>;
  completeApplication(
    ctx: Ctx,
    id: string,
    officerId: string,
    notify: Omit<NewGovNotification, 'userId'> | null,
  ): Promise<GovApplication>;
  /** requestMoreInfo нь info_required руу шилжүүлж SLA цагийг ЗОГСООНО. */
  requestMoreInfo(ctx: Ctx, id: string, officerId: string, note: string): Promise<GovApplication>;
  /** resumeFromInfo нь цагийг ҮРГЭЛЖЛҮҮЛЖ, due_at-г зогссон хугацаагаар хойшлуулна. */
  resumeFromInfo(ctx: Ctx, userId: string, id: string): Promise<GovApplication>;

  // ── Timeline ──────────────────────────────────────────────────────────
  appendApplicationEvent(ctx: Ctx, input: NewGovApplicationEvent): Promise<void>;
  listApplicationEvents(ctx: Ctx, applicationId: string): Promise<GovApplicationEvent[]>;

  // ── SLA sweep (background) ────────────────────────────────────────────
  /** markSLABreached нь хугацаа хэтэрсэн ч тэмдэглэгдээгүйг тэмдэглэнэ (latch). */
  markSLABreached(ctx: Ctx): Promise<GovApplication[]>;
  /** tacitApprovals нь чимээгүй зөвшөөрөл идэвхтэй үйлчилгээг зөвшөөрөгдсөнд тооцно. */
  tacitApprovals(ctx: Ctx): Promise<GovApplication[]>;

  // ── Лавлагаа ──────────────────────────────────────────────────────────
  listReferences(ctx: Ctx, userId: string): Promise<GovReference[]>;
  createReference(ctx: Ctx, input: NewGovReference): Promise<GovReference>;

  // ── Мэдэгдэл ──────────────────────────────────────────────────────────
  createNotification(ctx: Ctx, input: NewGovNotification): Promise<void>;
  listNotifications(ctx: Ctx, userId: string): Promise<GovNotification[]>;
  markNotificationRead(ctx: Ctx, userId: string, id: string): Promise<void>;
  markAllNotificationsRead(ctx: Ctx, userId: string): Promise<void>;

  // ── Төлбөр ────────────────────────────────────────────────────────────
  listPayments(ctx: Ctx, userId: string): Promise<GovPayment[]>;
  payPayment(ctx: Ctx, userId: string, id: string): Promise<void>;

  // ── Цаг захиалга ──────────────────────────────────────────────────────
  listAppointments(ctx: Ctx, userId: string): Promise<GovAppointment[]>;
  createAppointment(ctx: Ctx, input: NewGovAppointment): Promise<GovAppointment>;
  cancelAppointment(ctx: Ctx, userId: string, id: string): Promise<void>;

  // ── Нэгтгэл ───────────────────────────────────────────────────────────
  overview(ctx: Ctx, userId: string): Promise<GovOverview>;

  // ── Demo seed ─────────────────────────────────────────────────────────
  /** countUserRows нь хэрэглэгчид ямар нэг мөр байгаа эсэхийг тоолно. */
  countUserRows(ctx: Ctx, userId: string): Promise<number>;
  /** seedDemoData нь анх ороход жишээ өгөгдлийг НЭГ транзакцид үүсгэнэ. */
  seedDemoData(ctx: Ctx, userId: string): Promise<void>;
}
