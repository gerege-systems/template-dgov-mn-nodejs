// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/gov нь иргэний "Төрийн үйлчилгээ" порталын бизнес логик — каталог,
// хүсэлт, лавлагаа, мэдэгдэл, төлбөр, цаг захиалга, менежерийн дараалал.
//
// Хэрэглэгч-тус-бүрийн үйлдлүүд нь БАТАЛГААЖСАН userId-г шаардана (handler нь
// JWT-ээс өгнө — body/query-гээр дамжуулах боломжгүй).

import { randomInt } from 'node:crypto';

import { badRequest, conflict } from '../../apperror/index.js';
import type {
  GovDecisionInput,
  GovRepository,
  NewGovApplication,
  NewGovReference,
} from '../../datasources/repositories/interface/gov.js';
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
} from '../../domain/gov.js';
import {
  govCanTransition,
  govIsOpen,
  GovFulfilmentAuto,
  GovResultGranted,
  GovResultProcessed,
  GovResultRefused,
  GovStatusApproved,
  GovStatusCancelled,
  GovStatusCompleted,
  GovStatusRegistered,
  GovStatusRejected,
} from '../../domain/gov.js';
import { withService, type Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';

/** referenceTitles нь зөвшөөрөгдсөн лавлагааны төрөл → гарчиг. */
const referenceTitles: Record<string, string> = {
  residence: 'Оршин суугаа газрын лавлагаа',
  birth: 'Төрсний гэрчилгээний лавлагаа',
  marriage: 'Гэрлэлтийн байдлын лавлагаа',
  tax: 'Татварын тодорхойлолт',
  social_ins: 'Нийгмийн даатгалын лавлагаа',
  criminal: 'Ял эдэлж байгаагүй тодорхойлолт',
};

export interface ApplyRequest {
  serviceId: string;
  note: string;
  payload: Record<string, unknown> | null;
}

/**
 * ApplyResult нь хүсэлтийн үр дүн. autoIssued=true үед үйлчилгээ ШУУД биелсэн
 * бөгөөд reference нь олгогдсон лавлагаа; эсрэг тохиолдолд хүсэлт менежерийн
 * дараалалд орсон бөгөөд dueAt нь амлагдсан хугацаа.
 */
export interface ApplyResult {
  application: GovApplication;
  reference: GovReference | null;
  autoIssued: boolean;
}

export interface DecideRequest {
  approve: boolean;
  note: string;
  result: string;
}

/** QueueItemDetail нь дараалал дахь нэг хүсэлтийн дэлгэрэнгүй. */
export interface QueueItemDetail {
  application: GovApplication;
  service: GovService | null;
  events: GovApplicationEvent[];
}

export interface BookRequest {
  serviceId: string;
  scheduledAt: Date;
  location: string;
  note: string;
}

export interface GovUsecase {
  listServices(ctx: Ctx): Promise<GovService[]>;
  listLifeEvents(ctx: Ctx): Promise<GovLifeEvent[]>;
  overview(ctx: Ctx, userId: string): Promise<GovOverview>;

  listApplications(ctx: Ctx, userId: string): Promise<GovApplication[]>;
  apply(ctx: Ctx, userId: string, req: ApplyRequest): Promise<ApplyResult>;
  cancelApplication(ctx: Ctx, userId: string, id: string): Promise<void>;
  applicationTimeline(ctx: Ctx, userId: string, id: string): Promise<GovApplicationEvent[]>;
  provideInfo(ctx: Ctx, userId: string, id: string, note: string): Promise<GovApplication>;

  queueStats(ctx: Ctx, officerId: string): Promise<GovQueueStats>;
  listQueue(ctx: Ctx, officerId: string, filter: GovQueueFilter): Promise<GovApplication[]>;
  queueItem(ctx: Ctx, id: string): Promise<QueueItemDetail>;
  assign(ctx: Ctx, officerId: string, id: string): Promise<GovApplication>;
  decide(ctx: Ctx, officerId: string, id: string, req: DecideRequest): Promise<GovApplication>;
  complete(ctx: Ctx, officerId: string, id: string): Promise<GovApplication>;
  requestInfo(ctx: Ctx, officerId: string, id: string, note: string): Promise<GovApplication>;

  /** slaSweep нь background worker-ээс дуудагдана. */
  slaSweep(ctx: Ctx): Promise<void>;

  listReferences(ctx: Ctx, userId: string): Promise<GovReference[]>;
  requestReference(ctx: Ctx, userId: string, type: string): Promise<GovReference>;

  listNotifications(ctx: Ctx, userId: string): Promise<GovNotification[]>;
  markNotificationRead(ctx: Ctx, userId: string, id: string): Promise<void>;
  markAllNotificationsRead(ctx: Ctx, userId: string): Promise<void>;

  listPayments(ctx: Ctx, userId: string): Promise<GovPayment[]>;
  payPayment(ctx: Ctx, userId: string, id: string): Promise<void>;

  listAppointments(ctx: Ctx, userId: string): Promise<GovAppointment[]>;
  bookAppointment(ctx: Ctx, userId: string, req: BookRequest): Promise<GovAppointment>;
  cancelAppointment(ctx: Ctx, userId: string, id: string): Promise<void>;
}

/** addMonths нь огноо дээр сар нэмнэ (лавлагааны хүчинтэй хугацаа). */
function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

/** formatDue нь эцсийн хугацааг иргэнд харагдах хэлбэрээр бичнэ. */
function formatDue(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

class GovUsecaseImpl implements GovUsecase {
  constructor(
    private readonly repo: GovRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * refNo нь "PREFIX-YYYY-NNNNNN" хэлбэрийн лавлах дугаар үүсгэнэ (6 оронтой
   * криптографийн санамсаргүй тоо).
   */
  private refNo(prefix: string): string {
    const seq = 100000 + randomInt(900000);
    return `${prefix}-${String(this.now().getFullYear())}-${String(seq).padStart(6, '0')}`;
  }

  /**
   * ensureSeeded нь хэрэглэгч АНХ ороход (per-user өгөгдөл огт байхгүй үед)
   * жишээ demo өгөгдлийг нэг удаа үүсгэнэ. Алдааг ЗАЛГИНА — seed бүтэлгүйтсэн ч
   * уншилт үргэлжилнэ (зүгээр хоосон харагдана).
   */
  private async ensureSeeded(ctx: Ctx, userId: string): Promise<void> {
    try {
      const n = await this.repo.countUserRows(ctx, userId);
      if (n > 0) return;
      await this.repo.seedDemoData(ctx, userId);
    } catch (err) {
      logger.warnWithContext(ctx, 'gov: demo seed failed', {
        user_id: userId,
        error: logger.errText(err),
      });
    }
  }

  /** notify нь иргэнд мэдэгдэл бичнэ (best-effort — үндсэн үйлдлийг блоклохгүй). */
  private async notify(
    ctx: Ctx,
    userId: string,
    title: string,
    body: string,
    category: string,
  ): Promise<void> {
    try {
      await this.repo.createNotification(ctx, { userId, title, body, category });
    } catch (err) {
      logger.errorWithContext(ctx, 'gov: notification write failed (non-fatal)', {
        user_id: userId,
        error: logger.errText(err),
      });
    }
  }

  /** event нь timeline бичлэг нэмнэ (best-effort). */
  private async event(
    ctx: Ctx,
    applicationId: string,
    actorId: string,
    actorRole: string,
    status: string,
    type: string,
    detail: string,
  ): Promise<void> {
    try {
      await this.repo.appendApplicationEvent(ctx, {
        applicationId,
        actorId: actorId === '' ? null : actorId,
        actorRole,
        fromStatus: '',
        toStatus: status,
        type,
        detail,
      });
    } catch (err) {
      logger.errorWithContext(ctx, 'gov: timeline write failed (non-fatal)', {
        application_id: applicationId,
        error: logger.errText(err),
      });
    }
  }

  // ── Каталог ───────────────────────────────────────────────────────────

  async listServices(ctx: Ctx): Promise<GovService[]> {
    return await this.repo.listServices(ctx);
  }

  async listLifeEvents(ctx: Ctx): Promise<GovLifeEvent[]> {
    return await this.repo.listLifeEvents(ctx);
  }

  async overview(ctx: Ctx, userId: string): Promise<GovOverview> {
    await this.ensureSeeded(ctx, userId);
    return await this.repo.overview(ctx, userId);
  }

  // ── Хүсэлт (иргэн) ────────────────────────────────────────────────────

  async listApplications(ctx: Ctx, userId: string): Promise<GovApplication[]> {
    await this.ensureSeeded(ctx, userId);
    return await this.repo.listApplications(ctx, userId);
  }

  /**
   * apply нь иргэний хүсэлтийг хүлээн авна. Энэ бол модулийн ГОЛ салаалт:
   *
   *   fulfilment = 'auto'   → үйлчилгээ ШУУД биелнэ. Хүсэлт, лавлагаа, мэдэгдэл
   *                           НЭГ транзакцид үүсч, төлөв шууд 'completed' болно.
   *                           Хүн оролцохгүй тул менежерийн дараалалд ОРОХГҮЙ.
   *   fulfilment = 'manual' → хүсэлт бүртгэгдэж SLA цаг эхэлнэ, дараалалд орно.
   *                           Иргэнд "хүлээн авсан" мэдэгдэл өгнө.
   *
   * Ялгаа нь EU 2018/1724 Art.6(2)-той нийцнэ: гаралт шууд олгогдохгүй бол
   * хүлээн авсан тухай автомат мэдэгдэл өгөх ёстой; шууд олгогдож байвал
   * шаардлагагүй.
   */
  async apply(ctx: Ctx, userId: string, req: ApplyRequest): Promise<ApplyResult> {
    if (req.serviceId.trim() === '') throw badRequest('service is required');
    const svc = await this.repo.getService(ctx, req.serviceId.trim());
    if (!svc.enabled || svc.lifecycle !== 'active') {
      throw badRequest('энэ үйлчилгээ идэвхгүй байна');
    }

    const base: NewGovApplication = {
      userId,
      serviceId: svc.id,
      serviceCode: svc.code,
      serviceName: svc.name,
      referenceNo: this.refNo('APP'),
      status: '',
      result: '',
      note: req.note.trim(),
      payload: req.payload,
      dueAt: null,
      decidedAt: null,
      decisionNote: '',
      tacit: false,
    };

    return svc.fulfilment === GovFulfilmentAuto
      ? await this.applyAuto(ctx, svc, base)
      : await this.applyManual(ctx, svc, base);
  }

  private async applyAuto(ctx: Ctx, svc: GovService, app: NewGovApplication): Promise<ApplyResult> {
    // Үнэлэх эрх/үнэлгээний зайтай гэж тэмдэглэгдсэн үйлчилгээг АВТОМАТААР
    // биелүүлэхгүй — регистр дээр шалгагдсан ч энд давхар хамгаална.
    if (svc.hasDiscretion || svc.hasAssessment) {
      logger.warnWithContext(
        ctx,
        'gov: auto үйлчилгээ үнэлэх эрхтэй тэмдэглэгдсэн — гараар хянуулна',
        { service_code: svc.code },
      );
      return await this.applyManual(ctx, svc, app);
    }

    const now = this.now();
    const completed: NewGovApplication = {
      ...app,
      status: GovStatusCompleted,
      result: GovResultProcessed,
      decidedAt: now,
      decisionNote: 'Улсын бүртгэлээс шууд олгогдов',
    };

    let ref: NewGovReference | null = null;
    if (svc.outputRefType !== '') {
      ref = {
        userId: app.userId,
        type: svc.outputRefType,
        title: svc.name,
        referenceNo: this.refNo('REF'),
        status: 'issued',
        // 30 хоног хүчинтэй.
        validUntil: addMonths(now, 1),
        data: null,
      };
    }

    const out = await this.repo.createApplicationWithOutput(ctx, completed, ref, {
      userId: app.userId,
      title: `${svc.name} бэлэн боллоо`,
      body: `Таны хүссэн ${svc.name} амжилттай олгогдлоо. Лавлах дугаар: ${app.referenceNo}`,
      category: 'success',
    });

    return { application: out.application, reference: out.reference, autoIssued: true };
  }

  /**
   * applyManual нь менежерийн шийдвэр шаардах хүсэлтийг бүртгэнэ. SLA эцсийн
   * хугацааг ЭНД НЭГ УДАА тамгална — уншилт бүрт дахин тооцвол хугацаа "гулсаж"
   * зөрчлийг нуух байсан.
   */
  private async applyManual(
    ctx: Ctx,
    svc: GovService,
    app: NewGovApplication,
  ): Promise<ApplyResult> {
    const registered: NewGovApplication = {
      ...app,
      status: GovStatusRegistered,
      dueAt: svc.slaHours > 0 ? new Date(this.now().getTime() + svc.slaHours * 3600_000) : null,
    };

    const out = await this.repo.createApplication(ctx, registered);

    // Art.6(2)(b) — гаралт шууд олгогдоогүй тул хүлээн авсан тухай мэдэгдэл.
    let body = `Таны ${svc.name} хүсэлт бүртгэгдлээ. Лавлах дугаар: ${out.referenceNo}.`;
    if (out.dueAt !== null) body += ` Шийдвэрлэх хугацаа: ${formatDue(out.dueAt)}.`;
    await this.notify(ctx, out.userId, 'Хүсэлт хүлээн авлаа', body, 'info');

    return { application: out, reference: null, autoIssued: false };
  }

  async cancelApplication(ctx: Ctx, userId: string, id: string): Promise<void> {
    await this.repo.setApplicationStatus(ctx, userId, id, GovStatusCancelled);
  }

  async applicationTimeline(ctx: Ctx, userId: string, id: string): Promise<GovApplicationEvent[]> {
    // Эзэмшлийг ЭХЛЭЭД шалгана — timeline нь RLS-ээр хамгаалагдсан ч "байхгүй"
    // ба "чинийх биш" хоёрыг ИЖИЛ 404-өөр хариулж, өөр хүний хүсэлт байгаа
    // эсэхийг тандахаас сэргийлнэ.
    await this.repo.getApplication(ctx, userId, id);
    return await this.repo.listApplicationEvents(ctx, id);
  }

  async provideInfo(ctx: Ctx, userId: string, id: string, note: string): Promise<GovApplication> {
    const app = await this.repo.resumeFromInfo(ctx, userId, id);
    const n = note.trim();
    if (n !== '') await this.event(ctx, app.id, userId, 'user', app.status, 'info_note', n);
    return app;
  }

  // ── Менежерийн дараалал ───────────────────────────────────────────────

  async queueStats(ctx: Ctx, officerId: string): Promise<GovQueueStats> {
    return await this.repo.queueStats(ctx, officerId);
  }

  async listQueue(ctx: Ctx, officerId: string, filter: GovQueueFilter): Promise<GovApplication[]> {
    const f = { ...filter };
    // "me" нь UI-ийн товчлол — ЭНД л баталгаажсан officerId болж хөрвөнө,
    // ингэснээр клиент өөр хүний ID-г шургуулах боломжгүй.
    if (f.assignedTo === 'me') f.assignedTo = officerId;
    else if (f.assignedTo !== '') throw badRequest("assigned_to нь зөвхөн 'me' байж болно");

    if (
      f.status !== '' &&
      !govIsOpen(f.status) &&
      f.status !== GovStatusCompleted &&
      f.status !== GovStatusRejected
    ) {
      throw badRequest(`тодорхойгүй төлөв: ${f.status}`);
    }
    return await this.repo.listQueue(ctx, f);
  }

  async queueItem(ctx: Ctx, id: string): Promise<QueueItemDetail> {
    const application = await this.repo.getApplicationAny(ctx, id);
    let service: GovService | null = null;
    if (application.serviceId !== null) {
      try {
        service = await this.repo.getService(ctx, application.serviceId);
      } catch {
        // Үйлчилгээ устсан/олдоогүй ч хүсэлтийн дэлгэрэнгүй харагдах ёстой.
        service = null;
      }
    }
    const events = await this.repo.listApplicationEvents(ctx, id);
    return { application, service, events };
  }

  async assign(ctx: Ctx, officerId: string, id: string): Promise<GovApplication> {
    return await this.repo.assignApplication(ctx, id, officerId);
  }

  /**
   * decide нь менежерийн эцсийн шийдвэрийг гүйцэтгэнэ. Зөвшөөрсөн тохиолдолд
   * үйлчилгээний тодорхойлолт дээр үндэслэн гаралтыг (лавлагаа) үүсгэнэ.
   */
  async decide(
    ctx: Ctx,
    officerId: string,
    id: string,
    req: DecideRequest,
  ): Promise<GovApplication> {
    const note = req.note.trim();
    // Татгалзах шийдвэр нь ҮРГЭЛЖ үндэслэлтэй байх ёстой — иргэн юунд
    // татгалзсаныг мэдэж, гомдол гаргах боломжтой байх нь наад захын шаардлага.
    if (!req.approve && note === '') throw badRequest('татгалзах үндэслэл заавал бичих ёстой');

    const app = await this.repo.getApplicationAny(ctx, id);

    const decision: GovDecisionInput = {
      applicationId: id,
      officerId,
      target: GovStatusRejected,
      result: GovResultRefused,
      note,
      outputRef: null,
      notify: null,
    };

    if (req.approve) {
      decision.result = req.result.trim() === '' ? GovResultGranted : req.result.trim();

      // Зөвшөөрсний дараа хүсэлт ДУУССАН эсэхийг ГАРАЛТЫН ТӨРӨЛ шийднэ:
      // лавлагаа/тодорхойлолт бол тэр дороо олгогдож дуусна; биет зүйл
      // (үнэмлэх, гэрчилгээ) бол хэвлэгдэж хүргэгдэх хүртэл 'approved'.
      decision.target = GovStatusApproved;
      if (app.serviceId !== null) {
        try {
          const svc = await this.repo.getService(ctx, app.serviceId);
          if (svc.outputRefType !== '') {
            decision.outputRef = {
              userId: app.userId,
              type: svc.outputRefType,
              title: svc.name,
              referenceNo: this.refNo('REF'),
              status: 'issued',
              validUntil: addMonths(this.now(), 1),
              data: null,
            };
            decision.target = GovStatusCompleted;
          }
        } catch {
          // Үйлчилгээ олдоогүй — гаралтгүйгээр 'approved' болно.
        }
      }

      decision.notify =
        decision.target === GovStatusCompleted
          ? {
              title: `${app.serviceName} бэлэн боллоо`,
              body: `Таны ${app.serviceName} хүсэлт (${app.referenceNo}) зөвшөөрөгдөж, гаралт олгогдлоо.`,
              category: 'success',
            }
          : {
              title: `${app.serviceName} хүсэлт зөвшөөрөгдлөө`,
              body: `Таны ${app.serviceName} хүсэлт (${app.referenceNo}) зөвшөөрөгдлөө. Бэлэн болмогц мэдэгдэнэ.`,
              category: 'success',
            };
    } else {
      decision.notify = {
        title: `${app.serviceName} хүсэлт татгалзагдлаа`,
        body: `Таны ${app.serviceName} хүсэлт (${app.referenceNo}) татгалзагдлаа. Үндэслэл: ${note}`,
        category: 'warning',
      };
    }

    // Төлөвийн машиныг ЭНД шалгана — ойлгомжтой алдааны мэдэгдэл өгөхийн тулд.
    // Repository-ийн SQL `WHERE` guard нь үүнийг ДАХИН хэрэгжүүлдэг: тэр нь
    // уралдааныг (хоёр менежер зэрэг дарах) хаах давхарга, энэ нь дүрмийн
    // уншигдахуйц эх сурвалж. ХОЁУЛАА хэрэгтэй.
    if (!govCanTransition(app.status, decision.target)) {
      throw conflict(`'${app.status}' төлөвөөс '${decision.target}' руу шилжих боломжгүй`);
    }
    return await this.repo.decideApplication(ctx, decision);
  }

  async complete(ctx: Ctx, officerId: string, id: string): Promise<GovApplication> {
    const app = await this.repo.getApplicationAny(ctx, id);
    return await this.repo.completeApplication(ctx, id, officerId, {
      title: `${app.serviceName} бэлэн боллоо`,
      body: `Таны ${app.serviceName} (${app.referenceNo}) бэлэн болж, гүйцэтгэл дууслаа.`,
      category: 'success',
    });
  }

  async requestInfo(
    ctx: Ctx,
    officerId: string,
    id: string,
    note: string,
  ): Promise<GovApplication> {
    const n = note.trim();
    if (n === '') throw badRequest('ямар мэдээлэл дутуу байгааг тодорхой бичнэ үү');
    const app = await this.repo.requestMoreInfo(ctx, id, officerId, n);
    await this.notify(
      ctx,
      app.userId,
      `${app.serviceName} — нэмэлт мэдээлэл шаардлагатай`,
      `Таны хүсэлт (${app.referenceNo}) дээр нэмэлт мэдээлэл шаардагдаж байна: ${n}` +
        ' Мэдээллийг ирүүлэх хүртэл шийдвэрлэх хугацаа зогсоно.',
      'warning',
    );
    return app;
  }

  // ── SLA sweep (background worker) ─────────────────────────────────────

  /**
   * slaSweep нь ХОЁР зүйлийг хийнэ:
   *   1. Хугацаа хэтэрсэн хүсэлтийг НЭГ удаа тэмдэглэж иргэнд мэдэгдэнэ.
   *   2. Чимээгүй зөвшөөрөл идэвхтэй үйлчилгээний хугацаа хэтэрсэн хүсэлтийг
   *      зөвшөөрөгдсөнд тооцож иргэнд мэдэгдэнэ.
   *
   * Нэг хүсэлтийн алдаа бусдыг зогсоохгүй — sweep нь давтагдан ажилладаг тул
   * дараагийн эргэлтэд дахин оролдоно.
   */
  async slaSweep(ctx: Ctx): Promise<void> {
    // Sweep нь HTTP хүсэлт БИШ, background worker-ээс дуудагдана — context-д
    // ямар ч identity байхгүй. RLS нь identity-гүй үед БҮХ мөрийг хаадаг
    // (fail-closed) тул энд ЗААВАЛ системийн үүрэг тавина, эс тэгвээс sweep
    // чимээгүйхэн тэг мөр боловсруулж "ажиллаж байгаа мэт" харагдана.
    const sctx = withService(ctx);

    try {
      const breached = await this.repo.markSLABreached(sctx);
      for (const a of breached) {
        await this.notify(
          sctx,
          a.userId,
          `${a.serviceName} — хугацаа хэтэрлээ`,
          `Таны хүсэлт (${a.referenceNo}) шийдвэрлэх хугацаа хэтэрсэн байна. Байгууллага яаралтай хянана.`,
          'warning',
        );
        await this.event(
          sctx,
          a.id,
          '',
          'system',
          a.status,
          'sla_breached',
          'Шийдвэрлэх хугацаа хэтэрлээ',
        );
      }
    } catch (err) {
      logger.errorWithContext(sctx, 'gov: SLA breach sweep failed', {
        error: logger.errText(err),
      });
    }

    try {
      const tacit = await this.repo.tacitApprovals(sctx);
      for (const a of tacit) {
        await this.notify(
          sctx,
          a.userId,
          `${a.serviceName} — зөвшөөрөгдсөнд тооцов`,
          `Таны хүсэлт (${a.referenceNo}) хуулийн хугацаанд шийдвэрлэгдээгүй тул зөвшөөрсөнд тооцлоо. ` +
            'Энэ шийдвэр автоматаар гарсан болно.',
          'success',
        );
        await this.event(
          sctx,
          a.id,
          '',
          'system',
          a.status,
          'tacit_approved',
          'Хугацаа хэтэрсэн тул чимээгүй зөвшөөрлөөр шийдэгдэв',
        );
      }
    } catch (err) {
      logger.errorWithContext(sctx, 'gov: tacit approval sweep failed', {
        error: logger.errText(err),
      });
    }
  }

  // ── Лавлагаа ──────────────────────────────────────────────────────────

  async listReferences(ctx: Ctx, userId: string): Promise<GovReference[]> {
    await this.ensureSeeded(ctx, userId);
    return await this.repo.listReferences(ctx, userId);
  }

  async requestReference(ctx: Ctx, userId: string, type: string): Promise<GovReference> {
    const t = type.trim().toLowerCase();
    const title = referenceTitles[t];
    if (title === undefined) throw badRequest(`unknown reference type: ${type}`);
    return await this.repo.createReference(ctx, {
      userId,
      type: t,
      title,
      referenceNo: this.refNo('REF'),
      status: 'issued',
      // 30 хоног хүчинтэй.
      validUntil: addMonths(this.now(), 1),
      data: null,
    });
  }

  // ── Мэдэгдэл ──────────────────────────────────────────────────────────

  async listNotifications(ctx: Ctx, userId: string): Promise<GovNotification[]> {
    await this.ensureSeeded(ctx, userId);
    return await this.repo.listNotifications(ctx, userId);
  }

  async markNotificationRead(ctx: Ctx, userId: string, id: string): Promise<void> {
    await this.repo.markNotificationRead(ctx, userId, id);
  }

  async markAllNotificationsRead(ctx: Ctx, userId: string): Promise<void> {
    await this.repo.markAllNotificationsRead(ctx, userId);
  }

  // ── Төлбөр ────────────────────────────────────────────────────────────

  async listPayments(ctx: Ctx, userId: string): Promise<GovPayment[]> {
    await this.ensureSeeded(ctx, userId);
    return await this.repo.listPayments(ctx, userId);
  }

  async payPayment(ctx: Ctx, userId: string, id: string): Promise<void> {
    await this.repo.payPayment(ctx, userId, id);
  }

  // ── Цаг захиалга ──────────────────────────────────────────────────────

  async listAppointments(ctx: Ctx, userId: string): Promise<GovAppointment[]> {
    await this.ensureSeeded(ctx, userId);
    return await this.repo.listAppointments(ctx, userId);
  }

  async bookAppointment(ctx: Ctx, userId: string, req: BookRequest): Promise<GovAppointment> {
    if (Number.isNaN(req.scheduledAt.getTime())) throw badRequest('scheduled time is required');
    if (req.scheduledAt.getTime() <= this.now().getTime()) {
      throw badRequest('scheduled time must be in the future');
    }
    // Дээд хязгаар — 1 жилээс хол цагийг татгалзана (хог өгөгдлөөс сэргийлнэ).
    const oneYear = new Date(this.now());
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    if (req.scheduledAt.getTime() > oneYear.getTime()) {
      throw badRequest('scheduled time is too far in the future');
    }

    let serviceId: string | null = null;
    let serviceName = '';
    let agency = '';
    const sid = req.serviceId.trim();
    if (sid !== '') {
      const svc = await this.repo.getService(ctx, sid);
      serviceId = svc.id;
      serviceName = svc.name;
      agency = svc.agency;
    }

    return await this.repo.createAppointment(ctx, {
      userId,
      serviceId,
      serviceName,
      agency,
      location: req.location.trim(),
      scheduledAt: req.scheduledAt,
      status: 'booked',
      note: req.note.trim(),
    });
  }

  async cancelAppointment(ctx: Ctx, userId: string, id: string): Promise<void> {
    await this.repo.cancelAppointment(ctx, userId, id);
  }
}

export const newGovUsecase = (repo: GovRepository, now?: () => Date): GovUsecase =>
  new GovUsecaseImpl(repo, now);
