// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /gov/* endpoint-ууд — иргэний "Төрийн үйлчилгээ" портал болон менежерийн
// дараалал.
//
// Хэрэглэгчийн ID нь ЗӨВХӨН JWT-ээс гардаг тул иргэн өөр хүний хүсэлт/төлбөр/
// лавлагаа руу хандах боломжгүй; RLS давхарга бас барина (гүн хамгаалалт).

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { GovUsecase } from '../../../../usecases/gov/gov_usecase.js';
import {
  govAppointmentListResponse,
  govAppointmentResponse,
  govApplicationListResponse,
  govApplicationResponse,
  govEventListResponse,
  govLifeEventResponse,
  govNotificationListResponse,
  govOverviewResponse,
  govPaymentListResponse,
  govQueueStatsResponse,
  govReferenceListResponse,
  govReferenceResponse,
  govServiceListResponse,
  govServiceResponse,
} from '../../../dto/responses/gov.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request, Response } from '../../../types.js';

const applySchema = strictObject({
  service_id: z.string().uuid(),
  note: z.string().max(2000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const noteSchema = strictObject({
  note: z.string().max(2000).optional(),
});

const decideSchema = strictObject({
  approve: z.boolean(),
  note: z.string().max(2000).optional(),
  result: z.string().max(64).optional(),
});

const referenceSchema = strictObject({
  type: z.string().min(1).max(64),
});

const bookSchema = strictObject({
  service_id: z.string().uuid().optional(),
  scheduled_at: z.string().min(1),
  location: z.string().max(300).optional(),
  note: z.string().max(2000).optional(),
});

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

const queryString = (req: Request, key: string): string => {
  const raw: unknown = req.query[key];
  return typeof raw === 'string' ? raw : '';
};

const parseIntDefault = (req: Request, key: string, def: number): number => {
  const raw: unknown = req.query[key];
  if (typeof raw !== 'string' || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
};

export class GovHandler {
  constructor(private readonly usecase: GovUsecase) {}

  /** requireUser нь баталгаажсан хэрэглэгчийн ID-г буцаана (эсвэл 401 бичнэ). */
  private static requireUser(req: Request, res: Response): string | null {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return null;
    }
    return user.id;
  }

  // ── Каталог ───────────────────────────────────────────────────────────

  /** GET /gov/services · Bearer · 200 */
  listServices: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listServices(req.ctx);
    newSuccessResponse(req, res, 200, 'services fetched', govServiceListResponse(list));
  };

  /** GET /gov/life-events · Bearer · 200 */
  listLifeEvents: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listLifeEvents(req.ctx);
    newSuccessResponse(req, res, 200, 'life events fetched', list.map(govLifeEventResponse));
  };

  /** GET /gov/overview · Bearer · 200 */
  overview: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const o = await this.usecase.overview(req.ctx, userId);
    newSuccessResponse(req, res, 200, 'gov overview', govOverviewResponse(o));
  };

  // ── Хүсэлт (иргэн) ────────────────────────────────────────────────────

  /** GET /gov/applications · Bearer · 200 */
  listApplications: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const list = await this.usecase.listApplications(req.ctx, userId);
    newSuccessResponse(req, res, 200, 'applications fetched', govApplicationListResponse(list));
  };

  /**
   * apply нь хүсэлт илгээнэ. `auto` үйлчилгээ ШУУД биелж лавлагаа олгогдоно
   * (201 + reference); `manual` бол дараалалд орж SLA цаг эхэлнэ.
   *
   * POST /gov/applications · Bearer + write limit · 201 · 400 · 422
   */
  apply: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const body = decodeBody(req, applySchema);
    const out = await this.usecase.apply(req.ctx, userId, {
      serviceId: body.service_id,
      note: body.note ?? '',
      payload: body.payload ?? null,
    });
    newSuccessResponse(
      req,
      res,
      201,
      out.autoIssued ? 'service fulfilled' : 'application submitted',
      {
        application: govApplicationResponse(out.application),
        reference: out.reference === null ? null : govReferenceResponse(out.reference),
        auto_issued: out.autoIssued,
      },
    );
  };

  /** POST /gov/applications/:id/cancel · Bearer + write limit · 200 · 404 */
  cancelApplication: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    await this.usecase.cancelApplication(req.ctx, userId, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'application cancelled');
  };

  /** GET /gov/applications/:id/timeline · Bearer · 200 · 404 */
  applicationTimeline: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const list = await this.usecase.applicationTimeline(req.ctx, userId, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'timeline fetched', govEventListResponse(list));
  };

  /**
   * provideInfo нь info_required төлөвт байгаа хүсэлтэд иргэн нэмэлт мэдээлэл
   * өгснийг бүртгэж SLA цагийг ҮРГЭЛЖЛҮҮЛНЭ.
   *
   * POST /gov/applications/:id/provide-info · Bearer + write limit · 200 · 409
   */
  provideInfo: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const body = decodeBody(req, noteSchema);
    const app = await this.usecase.provideInfo(
      req.ctx,
      userId,
      pathParam(req, 'id'),
      body.note ?? '',
    );
    newSuccessResponse(req, res, 200, 'information provided', govApplicationResponse(app));
  };

  // ── Менежерийн дараалал ───────────────────────────────────────────────

  /** GET /gov/officer/stats · Bearer + gov.review · 200 */
  queueStats: AsyncHandler = async (req, res) => {
    const officerId = GovHandler.requireUser(req, res);
    if (officerId === null) return;
    const s = await this.usecase.queueStats(req.ctx, officerId);
    newSuccessResponse(req, res, 200, 'queue stats', govQueueStatsResponse(s));
  };

  /** GET /gov/officer/queue · Bearer + gov.review · 200 · 400 */
  listQueue: AsyncHandler = async (req, res) => {
    const officerId = GovHandler.requireUser(req, res);
    if (officerId === null) return;
    const list = await this.usecase.listQueue(req.ctx, officerId, {
      status: queryString(req, 'status'),
      assignedTo: queryString(req, 'assigned_to'),
      overdue: queryString(req, 'overdue') === 'true',
      limit: parseIntDefault(req, 'limit', 50),
      offset: parseIntDefault(req, 'offset', 0),
    });
    newSuccessResponse(req, res, 200, 'queue fetched', govApplicationListResponse(list));
  };

  /** GET /gov/officer/queue/:id · Bearer + gov.review · 200 · 404 */
  queueItem: AsyncHandler = async (req, res) => {
    const detail = await this.usecase.queueItem(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'queue item fetched', {
      application: govApplicationResponse(detail.application),
      service: detail.service === null ? null : govServiceResponse(detail.service),
      events: govEventListResponse(detail.events),
    });
  };

  /** POST /gov/officer/queue/:id/assign · Bearer + gov.review · 200 · 409 */
  assign: AsyncHandler = async (req, res) => {
    const officerId = GovHandler.requireUser(req, res);
    if (officerId === null) return;
    const app = await this.usecase.assign(req.ctx, officerId, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'application assigned', govApplicationResponse(app));
  };

  /** POST /gov/officer/queue/:id/decide · Bearer + gov.review · 200 · 400 · 409 */
  decide: AsyncHandler = async (req, res) => {
    const officerId = GovHandler.requireUser(req, res);
    if (officerId === null) return;
    const body = decodeBody(req, decideSchema);
    const app = await this.usecase.decide(req.ctx, officerId, pathParam(req, 'id'), {
      approve: body.approve,
      note: body.note ?? '',
      result: body.result ?? '',
    });
    newSuccessResponse(req, res, 200, 'application decided', govApplicationResponse(app));
  };

  /** POST /gov/officer/queue/:id/complete · Bearer + gov.review · 200 · 409 */
  complete: AsyncHandler = async (req, res) => {
    const officerId = GovHandler.requireUser(req, res);
    if (officerId === null) return;
    const app = await this.usecase.complete(req.ctx, officerId, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'application completed', govApplicationResponse(app));
  };

  /** POST /gov/officer/queue/:id/request-info · Bearer + gov.review · 200 · 400 · 409 */
  requestInfo: AsyncHandler = async (req, res) => {
    const officerId = GovHandler.requireUser(req, res);
    if (officerId === null) return;
    const body = decodeBody(req, noteSchema);
    const app = await this.usecase.requestInfo(
      req.ctx,
      officerId,
      pathParam(req, 'id'),
      body.note ?? '',
    );
    newSuccessResponse(req, res, 200, 'information requested', govApplicationResponse(app));
  };

  // ── Лавлагаа ──────────────────────────────────────────────────────────

  /** GET /gov/references · Bearer · 200 */
  listReferences: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const list = await this.usecase.listReferences(req.ctx, userId);
    newSuccessResponse(req, res, 200, 'references fetched', govReferenceListResponse(list));
  };

  /** POST /gov/references · Bearer + write limit · 201 · 400 · 422 */
  requestReference: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const body = decodeBody(req, referenceSchema);
    const ref = await this.usecase.requestReference(req.ctx, userId, body.type);
    newSuccessResponse(req, res, 201, 'reference issued', govReferenceResponse(ref));
  };

  // ── Мэдэгдэл ──────────────────────────────────────────────────────────

  /** GET /gov/notifications · Bearer · 200 */
  listNotifications: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const list = await this.usecase.listNotifications(req.ctx, userId);
    newSuccessResponse(req, res, 200, 'notifications fetched', govNotificationListResponse(list));
  };

  /** POST /gov/notifications/:id/read · Bearer + write limit · 200 · 404 */
  markNotificationRead: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    await this.usecase.markNotificationRead(req.ctx, userId, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'notification marked read');
  };

  /** POST /gov/notifications/read-all · Bearer + write limit · 200 */
  markAllRead: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    await this.usecase.markAllNotificationsRead(req.ctx, userId);
    newSuccessResponse(req, res, 200, 'all notifications marked read');
  };

  // ── Төлбөр ────────────────────────────────────────────────────────────

  /** GET /gov/payments · Bearer · 200 */
  listPayments: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const list = await this.usecase.listPayments(req.ctx, userId);
    newSuccessResponse(req, res, 200, 'payments fetched', govPaymentListResponse(list));
  };

  /** POST /gov/payments/:id/pay · Bearer + write limit · 200 · 404 */
  payPayment: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    await this.usecase.payPayment(req.ctx, userId, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'payment completed');
  };

  // ── Цаг захиалга ──────────────────────────────────────────────────────

  /** GET /gov/appointments · Bearer · 200 */
  listAppointments: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const list = await this.usecase.listAppointments(req.ctx, userId);
    newSuccessResponse(req, res, 200, 'appointments fetched', govAppointmentListResponse(list));
  };

  /** POST /gov/appointments · Bearer + write limit · 201 · 400 · 422 */
  bookAppointment: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    const body = decodeBody(req, bookSchema);
    const appt = await this.usecase.bookAppointment(req.ctx, userId, {
      serviceId: body.service_id ?? '',
      scheduledAt: new Date(body.scheduled_at),
      location: body.location ?? '',
      note: body.note ?? '',
    });
    newSuccessResponse(req, res, 201, 'appointment booked', govAppointmentResponse(appt));
  };

  /** POST /gov/appointments/:id/cancel · Bearer + write limit · 200 · 404 */
  cancelAppointment: AsyncHandler = async (req, res) => {
    const userId = GovHandler.requireUser(req, res);
    if (userId === null) return;
    await this.usecase.cancelAppointment(req.ctx, userId, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'appointment cancelled');
  };
}

export const newGovHandler = (usecase: GovUsecase): GovHandler => new GovHandler(usecase);
