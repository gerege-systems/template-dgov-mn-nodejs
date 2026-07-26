// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Иргэний "Төрийн үйлчилгээ" порталын Postgres gateway.
//
// gov_services нь НИЙТИЙН каталог (RLS-гүй лавлах); бусад хүснэгтүүд нь
// хэрэглэгч-тус-бүрийн тул ХОЁР давхар хамгаалалттай: query бүр user_id-гаар ИЛ
// шүүгдэхээс гадна per-user query бүр RLS транзакцид identity тавьдаг тул
// Postgres-ийн бодлого мөрийн харагдалтыг мөн адил хязгаарлана
// (defense-in-depth).
//
// ТӨЛӨВИЙН ШИЛЖИЛТИЙГ SQL-ийн `WHERE status IN (...)` guard-аар давхар
// хэрэгжүүлнэ: зэрэг ирсэн хоёр дахь шийдвэр 0 мөр хөндөж Conflict авна.

import { conflict, internalCause, notFound } from '../../../../apperror/index.js';
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
} from '../../../../domain/gov.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import { pgErrorCode, type Db, type Queryable } from '../../../drivers/pg.js';
import type {
  GovDecisionInput,
  GovRepository,
  NewGovApplication,
  NewGovApplicationEvent,
  NewGovAppointment,
  NewGovNotification,
  NewGovReference,
} from '../../interface/gov.js';

const serviceColumns = `id, code, name, category, agency, description, fee, processing_days,
  processing_time, cofog_code, cofog_label, main_activity, sdg_code, output_type,
  output_ref_type, evidence, legal_basis, assurance_level, lifecycle, fulfilment,
  has_discretion, has_assessment, sla_hours, tacit_approval, online, enabled, created_at`;

const appColumns = `id, user_id, service_id, service_code, service_name, reference_no,
  status, result, note, payload, assigned_to, assigned_at, decided_by, decided_at,
  decision_note, due_at, sla_breached, suspended_at, output_ref_id, tacit,
  submitted_at, updated_at`;

const refColumns = `id, user_id, type, title, reference_no, status, issued_at, valid_until, data`;

const eventColumns = `id, application_id, actor_id, actor_role, from_status, to_status, type, detail, created_at`;

const payColumns = `id, user_id, title, category, amount, currency, status, due_date, paid_at, created_at`;

const apptColumns = `id, user_id, service_id, service_name, agency, location, scheduled_at, status, note, created_at`;

/** openStatuses нь нээлттэй төлвүүдийн SQL хэсэг — domain.govIsOpen-той таарна. */
const openStatuses = `('submitted','registered','in_review','info_required')`;

/** prefixed нь баганын жагсаалтад alias угтвар нэмнэ (UPDATE … FROM-ийн RETURNING). */
const prefixed = (cols: string, alias: string): string =>
  cols
    .split(',')
    .map((c) => `${alias}.${c.trim()}`)
    .join(', ');

interface ServiceRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  agency: string | null;
  description: string | null;
  fee: number;
  processing_days: number;
  processing_time: string | null;
  cofog_code: string | null;
  cofog_label: string | null;
  main_activity: string | null;
  sdg_code: string | null;
  output_type: string | null;
  output_ref_type: string | null;
  evidence: string[] | null;
  legal_basis: string | null;
  assurance_level: string | null;
  lifecycle: string | null;
  fulfilment: string | null;
  has_discretion: boolean;
  has_assessment: boolean;
  sla_hours: number;
  tacit_approval: boolean;
  online: boolean;
  enabled: boolean;
  created_at: Date;
}

const toService = (r: ServiceRow): GovService => ({
  id: r.id,
  code: r.code,
  name: r.name,
  category: r.category ?? '',
  agency: r.agency ?? '',
  description: r.description ?? '',
  fee: r.fee,
  processingDays: r.processing_days,
  processingTime: r.processing_time ?? '',
  cofogCode: r.cofog_code ?? '',
  cofogLabel: r.cofog_label ?? '',
  mainActivity: r.main_activity ?? '',
  sdgCode: r.sdg_code ?? '',
  outputType: r.output_type ?? '',
  outputRefType: r.output_ref_type ?? '',
  evidence: r.evidence ?? [],
  legalBasis: r.legal_basis ?? '',
  assuranceLevel: r.assurance_level ?? '',
  lifecycle: r.lifecycle ?? '',
  fulfilment: r.fulfilment ?? '',
  hasDiscretion: r.has_discretion,
  hasAssessment: r.has_assessment,
  slaHours: r.sla_hours,
  tacitApproval: r.tacit_approval,
  lifeEvents: [],
  online: r.online,
  enabled: r.enabled,
  createdAt: r.created_at,
});

interface AppRow {
  id: string;
  user_id: string;
  service_id: string | null;
  service_code: string | null;
  service_name: string | null;
  reference_no: string | null;
  status: string;
  result: string | null;
  note: string | null;
  payload: Record<string, unknown> | null;
  assigned_to: string | null;
  assigned_at: Date | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  due_at: Date | null;
  sla_breached: boolean;
  suspended_at: Date | null;
  output_ref_id: string | null;
  tacit: boolean;
  submitted_at: Date;
  updated_at: Date | null;
}

const toApplication = (r: AppRow): GovApplication => ({
  id: r.id,
  userId: r.user_id,
  serviceId: r.service_id,
  serviceCode: r.service_code ?? '',
  serviceName: r.service_name ?? '',
  referenceNo: r.reference_no ?? '',
  status: r.status,
  result: r.result ?? '',
  note: r.note ?? '',
  payload: r.payload,
  assignedTo: r.assigned_to,
  assignedAt: r.assigned_at,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note ?? '',
  dueAt: r.due_at,
  slaBreached: r.sla_breached,
  suspendedAt: r.suspended_at,
  outputRefId: r.output_ref_id,
  tacit: r.tacit,
  submittedAt: r.submitted_at,
  updatedAt: r.updated_at,
});

interface RefRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  reference_no: string | null;
  status: string;
  issued_at: Date;
  valid_until: Date | null;
  data: Record<string, unknown> | null;
}

const toReference = (r: RefRow): GovReference => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  title: r.title,
  referenceNo: r.reference_no ?? '',
  status: r.status,
  issuedAt: r.issued_at,
  validUntil: r.valid_until,
  data: r.data,
});

interface EventRow {
  id: string;
  application_id: string;
  actor_id: string | null;
  actor_role: string | null;
  from_status: string | null;
  to_status: string | null;
  type: string | null;
  detail: string | null;
  created_at: Date;
}

const toEvent = (r: EventRow): GovApplicationEvent => ({
  id: r.id,
  applicationId: r.application_id,
  actorId: r.actor_id,
  actorRole: r.actor_role ?? '',
  fromStatus: r.from_status ?? '',
  toStatus: r.to_status ?? '',
  type: r.type ?? '',
  detail: r.detail ?? '',
  createdAt: r.created_at,
});

interface PayRow {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  amount: number;
  currency: string | null;
  status: string;
  due_date: Date | null;
  paid_at: Date | null;
  created_at: Date;
}

const toPayment = (r: PayRow): GovPayment => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  category: r.category ?? '',
  amount: r.amount,
  currency: r.currency ?? 'MNT',
  status: r.status,
  dueDate: r.due_date,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});

interface ApptRow {
  id: string;
  user_id: string;
  service_id: string | null;
  service_name: string | null;
  agency: string | null;
  location: string | null;
  scheduled_at: Date;
  status: string;
  note: string | null;
  created_at: Date;
}

const toAppointment = (r: ApptRow): GovAppointment => ({
  id: r.id,
  userId: r.user_id,
  serviceId: r.service_id,
  serviceName: r.service_name ?? '',
  agency: r.agency ?? '',
  location: r.location ?? '',
  scheduledAt: r.scheduled_at,
  status: r.status,
  note: r.note ?? '',
  createdAt: r.created_at,
});

/** isInvalidUuid нь uuid биш текстийг (22P02) таана — 500 биш, "олдсонгүй". */
const isInvalidUuid = (err: unknown): boolean => pgErrorCode(err) === '22P02';
/** num нь bigint-ийн мөр хэлбэрийг тоо болгоно. */
const num = (v: string | number | null): number =>
  typeof v === 'number' ? v : Number.parseInt(v ?? '0', 10);
/** isDomain нь домэйн алдааг (аль хэдийн төрөлжсөнийг) таана. */
const isDomain = (err: unknown): boolean => err instanceof Error && err.name === 'DomainError';

/**
 * appendEventTx нь timeline бичлэгийг ӨГӨГДСӨН транзакцид нэмнэ — төлөв
 * өөрчлөлт болон түүний ул мөр АТОМАРТ үлдэхийн тулд.
 */
async function appendEventTx(
  tx: Queryable,
  e: NewGovApplicationEvent,
  ownerId: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO gov_application_events
         (application_id, user_id, actor_id, actor_role, from_status, to_status, type, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.applicationId, ownerId, e.actorId, e.actorRole, e.fromStatus, e.toStatus, e.type, e.detail],
  );
}

/** insertApplicationTx нь хүсэлтийг өгөгдсөн транзакцид үүсгэнэ. */
async function insertApplicationTx(
  tx: Queryable,
  input: NewGovApplication,
): Promise<GovApplication> {
  const res = await tx.query<AppRow>(
    `INSERT INTO gov_applications
         (user_id, service_id, service_code, service_name, reference_no,
          status, result, note, payload, due_at, decided_at, decision_note, tacit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${appColumns}`,
    [
      input.userId,
      input.serviceId,
      input.serviceCode,
      input.serviceName,
      input.referenceNo,
      input.status,
      input.result,
      input.note,
      input.payload ?? {},
      input.dueAt,
      input.decidedAt,
      input.decisionNote,
      input.tacit,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error('create application: no row returned');
  return toApplication(row);
}

/** insertReferenceTx нь лавлагааг өгөгдсөн транзакцид үүсгэнэ. */
async function insertReferenceTx(
  tx: Queryable,
  userId: string,
  ref: NewGovReference,
): Promise<GovReference> {
  const res = await tx.query<RefRow>(
    `INSERT INTO gov_references(user_id, type, title, reference_no, status, valid_until, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${refColumns}`,
    [userId, ref.type, ref.title, ref.referenceNo, ref.status, ref.validUntil, ref.data ?? {}],
  );
  const row = res.rows[0];
  if (!row) throw new Error('create reference: no row returned');
  return toReference(row);
}

/** insertNotificationTx нь мэдэгдлийг өгөгдсөн транзакцид бичнэ. */
async function insertNotificationTx(
  tx: Queryable,
  userId: string,
  n: { title: string; body: string; category: string },
): Promise<void> {
  await tx.query(
    `INSERT INTO gov_notifications(user_id, title, body, category) VALUES ($1,$2,$3,$4)`,
    [userId, n.title, n.body, n.category],
  );
}

class GovPostgres implements GovRepository {
  constructor(private readonly db: Db) {}

  // ── Каталог (нийтийн — RLS-гүй) ───────────────────────────────────────

  /**
   * attachLifeEvents нь өгөгдсөн үйлчилгээнүүдэд харгалзах Event-үүдийг НЭГ
   * нэмэлт query-гээр хавсаргана (N+1-ээс сэргийлнэ).
   *
   * Амьдралын үйл явдлын МАСТЕР нь регистр — ажлын каталог нь
   * registry_service_id-аараа дамжин уншина. Ингэснээр паспорт дээр хийсэн
   * өөрчлөлт иргэний портал дээр ШУУД тусна.
   */
  private async attachLifeEvents(ctx: Ctx, list: GovService[]): Promise<void> {
    if (list.length === 0) return;
    const res = await this.db.query<{
      id: string;
      code: string;
      name: string;
      kind: string;
      eu_code: string | null;
      en_label: string | null;
    }>(
      ctx,
      `SELECT g.id, le.code, le.name, le.kind, le.eu_code, le.en_label
         FROM gov_services g
         JOIN registry_service_events se ON se.service_id = g.registry_service_id
         JOIN registry_life_events le    ON le.id = se.event_id
        WHERE g.id = ANY($1)
        ORDER BY le.sort_order`,
      [list.map((s) => s.id)],
    );
    const byService = new Map<string, GovLifeEvent[]>();
    for (const r of res.rows) {
      const arr = byService.get(r.id) ?? [];
      arr.push({
        code: r.code,
        name: r.name,
        kind: r.kind,
        euCode: r.eu_code ?? '',
        enLabel: r.en_label ?? '',
      });
      byService.set(r.id, arr);
    }
    for (const s of list) s.lifeEvents = byService.get(s.id) ?? [];
  }

  async listServices(ctx: Ctx): Promise<GovService[]> {
    try {
      const res = await this.db.query<ServiceRow>(
        ctx,
        `SELECT ${serviceColumns} FROM gov_services
          WHERE enabled AND lifecycle = 'active' ORDER BY category, name`,
      );
      const list = res.rows.map(toService);
      await this.attachLifeEvents(ctx, list);
      return list;
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getService(ctx: Ctx, id: string): Promise<GovService> {
    let res;
    try {
      res = await this.db.query<ServiceRow>(
        ctx,
        `SELECT ${serviceColumns} FROM gov_services WHERE id = $1`,
        [id],
      );
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('service not found');
    const svc = toService(row);
    await this.attachLifeEvents(ctx, [svc]);
    return svc;
  }

  async listLifeEvents(ctx: Ctx): Promise<GovLifeEvent[]> {
    try {
      const res = await this.db.query<{
        code: string;
        name: string;
        kind: string;
        eu_code: string | null;
        en_label: string | null;
      }>(
        ctx,
        `SELECT code, name, kind, eu_code, en_label FROM registry_life_events ORDER BY sort_order`,
      );
      return res.rows.map((r) => ({
        code: r.code,
        name: r.name,
        kind: r.kind,
        euCode: r.eu_code ?? '',
        enLabel: r.en_label ?? '',
      }));
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Хүсэлт (иргэн — RLS) ──────────────────────────────────────────────

  async listApplications(ctx: Ctx, userId: string): Promise<GovApplication[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `SELECT ${appColumns} FROM gov_applications WHERE user_id = $1 ORDER BY submitted_at DESC`,
          [userId],
        );
        return res.rows.map(toApplication);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getApplication(ctx: Ctx, userId: string, id: string): Promise<GovApplication> {
    let row: AppRow | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `SELECT ${appColumns} FROM gov_applications WHERE id = $1 AND user_id = $2`,
          [id, userId],
        );
        return res.rows[0];
      });
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
    if (!row) throw notFound('application not found');
    return toApplication(row);
  }

  async createApplication(ctx: Ctx, input: NewGovApplication): Promise<GovApplication> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const app = await insertApplicationTx(tx, input);
        await appendEventTx(
          tx,
          {
            applicationId: app.id,
            actorId: app.userId,
            actorRole: 'user',
            fromStatus: '',
            toStatus: app.status,
            type: 'created',
            detail: 'Хүсэлт илгээгдэв',
          },
          app.userId,
        );
        return app;
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * createApplicationWithOutput нь AUTO горимын үйлчилгээг НЭГ транзакцид бүрэн
   * биелүүлнэ: хүсэлт (completed) → лавлагаа → мэдэгдэл → timeline. Аль нэг
   * алхам бүтэлгүйтвэл БҮГД буцна.
   *
   * Гаралт нь ШУУД олгогдож байгаа тул "хүлээн авсан" мэдэгдэл шаардлагагүй —
   * зөвхөн "гүйцэтгэл дууссан" мэдэгдэл өгнө.
   */
  async createApplicationWithOutput(
    ctx: Ctx,
    app: NewGovApplication,
    ref: NewGovReference | null,
    notify: NewGovNotification | null,
  ): Promise<{ application: GovApplication; reference: GovReference | null }> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const created = await insertApplicationTx(tx, app);
        let reference: GovReference | null = null;

        if (ref !== null) {
          reference = await insertReferenceTx(tx, created.userId, ref);
          await tx.query(`UPDATE gov_applications SET output_ref_id = $2 WHERE id = $1`, [
            created.id,
            reference.id,
          ]);
          created.outputRefId = reference.id;
        }

        if (notify !== null) await insertNotificationTx(tx, notify.userId, notify);

        await appendEventTx(
          tx,
          {
            applicationId: created.id,
            actorId: created.userId,
            actorRole: 'user',
            fromStatus: '',
            toStatus: created.status,
            type: 'auto_fulfilled',
            detail: 'Бүртгэлээс шууд олгогдов (хүний оролцоогүй)',
          },
          created.userId,
        );
        return { application: created, reference };
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * setApplicationStatus нь одоогоор зөвхөн ЦУЦЛАХАД ашиглагдана. Аль хэдийн
   * шийдэгдсэн/цуцлагдсан хүсэлтийг дахин цуцлахгүйн тулд зөвхөн ИДЭВХТЭЙ эх
   * төлвөөс шилжинэ.
   */
  async setApplicationStatus(ctx: Ctx, userId: string, id: string, status: string): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE gov_applications SET status = $3, updated_at = now()
            WHERE id = $1 AND user_id = $2 AND status IN ('submitted','in_review')`,
          [id, userId, status],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('active application not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('active application not found');
  }

  // ── Менежерийн дараалал ───────────────────────────────────────────────

  async queueStats(ctx: Ctx, officerId: string): Promise<GovQueueStats> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<{
          open: string;
          unassigned: string;
          mine: string;
          overdue: string;
          due_soon: string;
        }>(
          `SELECT
               count(*) FILTER (WHERE status IN ${openStatuses})                              AS open,
               count(*) FILTER (WHERE status IN ${openStatuses} AND assigned_to IS NULL)      AS unassigned,
               count(*) FILTER (WHERE status IN ${openStatuses} AND assigned_to = $1)         AS mine,
               count(*) FILTER (WHERE status IN ${openStatuses} AND due_at < now())           AS overdue,
               count(*) FILTER (WHERE status IN ${openStatuses} AND due_at >= now()
                                  AND due_at < now() + interval '24 hours')                   AS due_soon
             FROM gov_applications`,
          [officerId],
        );
        const r = res.rows[0];
        return {
          open: num(r?.open ?? '0'),
          unassigned: num(r?.unassigned ?? '0'),
          mine: num(r?.mine ?? '0'),
          overdue: num(r?.overdue ?? '0'),
          dueSoon: num(r?.due_soon ?? '0'),
        };
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async listQueue(ctx: Ctx, filter: GovQueueFilter): Promise<GovApplication[]> {
    const limit = filter.limit <= 0 || filter.limit > 200 ? 50 : filter.limit;
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        // Шүүлтүүрийг параметржүүлсэн NULL-шалгалтаар илэрхийлнэ — SQL-г
        // динамикаар угсрахгүй (injection-ийн гадаргууг ТЭГ байлгана).
        const res = await tx.query<AppRow>(
          `SELECT ${appColumns} FROM gov_applications
            WHERE ($1::text IS NULL AND status IN ${openStatuses} OR status = $1)
              AND ($2::uuid IS NULL OR assigned_to = $2)
              AND (NOT $3::bool OR (due_at IS NOT NULL AND due_at < now()))
            ORDER BY due_at NULLS LAST, submitted_at
            LIMIT $4 OFFSET $5`,
          [
            filter.status === '' ? null : filter.status,
            filter.assignedTo === '' ? null : filter.assignedTo,
            filter.overdue,
            limit,
            filter.offset,
          ],
        );
        return res.rows.map(toApplication);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getApplicationAny(ctx: Ctx, id: string): Promise<GovApplication> {
    let row: AppRow | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `SELECT ${appColumns} FROM gov_applications WHERE id = $1`,
          [id],
        );
        return res.rows[0];
      });
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
    if (!row) throw notFound('application not found');
    return toApplication(row);
  }

  /**
   * assignApplication нь хүсэлтийг менежерт оноож in_review болгоно.
   *
   * WHERE guard нь ХОЁР зүйлийг зэрэг хийнэ: (1) зөвшөөрөгдсөн эх төлвөөс л
   * шилжинэ, (2) өөр менежер аль хэдийн аваагүй байх. Зэрэг ирсэн 2 дахь
   * хүсэлт 0 мөр хөндөж Conflict авна.
   */
  async assignApplication(ctx: Ctx, id: string, officerId: string): Promise<GovApplication> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `UPDATE gov_applications
              SET assigned_to = $2, assigned_at = now(), status = 'in_review', updated_at = now()
            WHERE id = $1
              AND status IN ('submitted','registered','in_review')
              AND (assigned_to IS NULL OR assigned_to = $2)
            RETURNING ${appColumns}`,
          [id, officerId],
        );
        const row = res.rows[0];
        if (!row) {
          throw conflict('хүсэлт аль хэдийн авагдсан эсвэл хянах боломжгүй төлөвт байна');
        }
        const app = toApplication(row);
        await appendEventTx(
          tx,
          {
            applicationId: app.id,
            actorId: officerId,
            actorRole: 'officer',
            fromStatus: 'registered',
            toStatus: app.status,
            type: 'assigned',
            detail: 'Менежер хүсэлтийг хянахаар авав',
          },
          app.userId,
        );
        return app;
      });
    } catch (err) {
      if (isDomain(err)) throw err;
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
  }

  /**
   * decideApplication нь approve/reject шийдвэрийг НЭГ транзакцид бичнэ: төлөв +
   * шийдвэрлэгч + үр дүн, зөвшөөрсөн бол гаралт (лавлагаа), мэдэгдэл, timeline.
   */
  async decideApplication(ctx: Ctx, input: GovDecisionInput): Promise<GovApplication> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `UPDATE gov_applications
              SET status = $3, result = $4, decided_by = $2, decided_at = now(),
                  decision_note = $5, updated_at = now()
            WHERE id = $1
              AND status IN ('registered','in_review','info_required')
            RETURNING ${appColumns}`,
          [input.applicationId, input.officerId, input.target, input.result, input.note],
        );
        const row = res.rows[0];
        if (!row) {
          throw conflict('хүсэлт аль хэдийн шийдэгдсэн эсвэл шийдвэрлэх боломжгүй төлөвт байна');
        }
        const app = toApplication(row);

        if (input.outputRef !== null) {
          const ref = await insertReferenceTx(tx, app.userId, input.outputRef);
          await tx.query(`UPDATE gov_applications SET output_ref_id = $2 WHERE id = $1`, [
            app.id,
            ref.id,
          ]);
          app.outputRefId = ref.id;
        }

        if (input.notify !== null) await insertNotificationTx(tx, app.userId, input.notify);

        await appendEventTx(
          tx,
          {
            applicationId: app.id,
            actorId: input.officerId,
            actorRole: 'officer',
            fromStatus: '',
            toStatus: app.status,
            type: 'decided',
            detail: input.note,
          },
          app.userId,
        );
        return app;
      });
    } catch (err) {
      if (isDomain(err)) throw err;
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
  }

  /**
   * completeApplication нь `approved` (биет гаралт хүргэгдэхийг хүлээж буй)
   * хүсэлтийг хаана. ЗӨВХӨН энэ эх төлвөөс шилжинэ — шийдвэр гараагүй хүсэлтийг
   * "хүргэсэн" гэж хаах боломжгүй.
   */
  async completeApplication(
    ctx: Ctx,
    id: string,
    officerId: string,
    notify: Omit<NewGovNotification, 'userId'> | null,
  ): Promise<GovApplication> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `UPDATE gov_applications
              SET status = 'completed', updated_at = now()
            WHERE id = $1 AND status = 'approved'
            RETURNING ${appColumns}`,
          [id],
        );
        const row = res.rows[0];
        if (!row) throw conflict('зөвшөөрөгдсөн, хүргэгдэхийг хүлээж буй хүсэлт олдсонгүй');
        const app = toApplication(row);

        if (notify !== null) await insertNotificationTx(tx, app.userId, notify);

        await appendEventTx(
          tx,
          {
            applicationId: app.id,
            actorId: officerId,
            actorRole: 'officer',
            fromStatus: 'approved',
            toStatus: app.status,
            type: 'delivered',
            detail: 'Гаралт хүргэгдэв',
          },
          app.userId,
        );
        return app;
      });
    } catch (err) {
      if (isDomain(err)) throw err;
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
  }

  /**
   * requestMoreInfo нь info_required руу шилжүүлж SLA ЦАГИЙГ ЗОГСООНО
   * (suspended_at тамгална).
   *
   * Эрх зүйн үндэслэл: хугацаа нь бүх баримт бүрдсэн үеэс л явах ёстой —
   * иргэний удаашрал байгууллагын зөрчил болж бүртгэгдэхгүй.
   */
  async requestMoreInfo(
    ctx: Ctx,
    id: string,
    officerId: string,
    note: string,
  ): Promise<GovApplication> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `UPDATE gov_applications
              SET status = 'info_required', suspended_at = now(),
                  decision_note = $2, updated_at = now()
            WHERE id = $1 AND status IN ('registered','in_review')
            RETURNING ${appColumns}`,
          [id, note],
        );
        const row = res.rows[0];
        if (!row) throw conflict('хүсэлт нэмэлт мэдээлэл хүсэх боломжгүй төлөвт байна');
        const app = toApplication(row);
        await appendEventTx(
          tx,
          {
            applicationId: app.id,
            actorId: officerId,
            actorRole: 'officer',
            fromStatus: '',
            toStatus: app.status,
            type: 'info_requested',
            detail: note,
          },
          app.userId,
        );
        return app;
      });
    } catch (err) {
      if (isDomain(err)) throw err;
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
  }

  /**
   * resumeFromInfo нь иргэн баримтаа нэмсний дараа цагийг ҮРГЭЛЖЛҮҮЛНЭ: due_at-г
   * ЗОГССОН хугацааны туршид хойшлуулж, suspended_at-г цэвэрлэнэ.
   */
  async resumeFromInfo(ctx: Ctx, userId: string, id: string): Promise<GovApplication> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `UPDATE gov_applications
              SET status = 'in_review',
                  due_at = CASE
                      WHEN due_at IS NOT NULL AND suspended_at IS NOT NULL
                      THEN due_at + (now() - suspended_at)
                      ELSE due_at
                  END,
                  suspended_at = NULL,
                  updated_at = now()
            WHERE id = $1 AND user_id = $2 AND status = 'info_required'
            RETURNING ${appColumns}`,
          [id, userId],
        );
        const row = res.rows[0];
        if (!row) throw conflict('хүсэлт нэмэлт мэдээлэл хүлээж буй төлөвт байхгүй');
        return toApplication(row);
      });
    } catch (err) {
      if (isDomain(err)) throw err;
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
  }

  // ── Timeline ──────────────────────────────────────────────────────────

  async appendApplicationEvent(ctx: Ctx, input: NewGovApplicationEvent): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        const owner = await tx.query<{ user_id: string }>(
          `SELECT user_id FROM gov_applications WHERE id = $1`,
          [input.applicationId],
        );
        const ownerId = owner.rows[0]?.user_id;
        if (ownerId === undefined) throw notFound('application not found');
        await appendEventTx(tx, input, ownerId);
      });
    } catch (err) {
      if (isDomain(err)) throw err;
      if (isInvalidUuid(err)) throw notFound('application not found');
      throw internalCause(err);
    }
  }

  async listApplicationEvents(ctx: Ctx, applicationId: string): Promise<GovApplicationEvent[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<EventRow>(
          `SELECT ${eventColumns} FROM gov_application_events
            WHERE application_id = $1 ORDER BY created_at`,
          [applicationId],
        );
        return res.rows.map(toEvent);
      });
    } catch (err) {
      if (isInvalidUuid(err)) return [];
      throw internalCause(err);
    }
  }

  // ── SLA sweep ─────────────────────────────────────────────────────────

  async markSLABreached(ctx: Ctx): Promise<GovApplication[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        // `NOT sla_breached` нь latch — нэг хүсэлтэд НЭГ л удаа мэдэгдэнэ.
        const res = await tx.query<AppRow>(
          `UPDATE gov_applications
              SET sla_breached = true, updated_at = now()
            WHERE status IN ('submitted','registered','in_review')
              AND suspended_at IS NULL
              AND due_at IS NOT NULL AND due_at < now()
              AND NOT sla_breached
            RETURNING ${appColumns}`,
        );
        return res.rows.map(toApplication);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * tacitApprovals нь чимээгүй зөвшөөрөл идэвхжсэн үйлчилгээний хугацаа
   * хэтэрсэн хүсэлтүүдийг зөвшөөрөгдсөнд тооцно. `tacit = true` тэмдэглэх нь
   * ЧУХАЛ — шийдвэр АВТОМАТААР гарсныг иргэнд ил мэдэгдэх үүрэгтэй.
   */
  async tacitApprovals(ctx: Ctx): Promise<GovApplication[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<AppRow>(
          `UPDATE gov_applications a
              SET status = 'completed', result = 'granted', tacit = true,
                  decided_at = now(), updated_at = now(),
                  decision_note = 'Хуулийн хугацаанд шийдвэр гараагүй тул зөвшөөрсөнд тооцов'
             FROM gov_services s
            WHERE s.id = a.service_id
              AND s.tacit_approval
              AND a.status IN ('registered','in_review')
              AND a.suspended_at IS NULL
              AND a.due_at IS NOT NULL AND a.due_at < now()
            RETURNING ${prefixed(appColumns, 'a')}`,
        );
        return res.rows.map(toApplication);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Лавлагаа ──────────────────────────────────────────────────────────

  async listReferences(ctx: Ctx, userId: string): Promise<GovReference[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<RefRow>(
          `SELECT ${refColumns} FROM gov_references WHERE user_id = $1 ORDER BY issued_at DESC`,
          [userId],
        );
        return res.rows.map(toReference);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async createReference(ctx: Ctx, input: NewGovReference): Promise<GovReference> {
    try {
      return await this.db.withRLS(ctx, (tx) => insertReferenceTx(tx, input.userId, input));
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Мэдэгдэл ──────────────────────────────────────────────────────────

  async createNotification(ctx: Ctx, input: NewGovNotification): Promise<void> {
    try {
      // Менежер/систем нь ӨӨРИЙНХ НЬ БИШ хэрэглэгчид бичих тул officer эсвэл
      // service RLS үүрэг шаардана (дуудагч ctx-ээ тохируулна).
      await this.db.withRLS(ctx, (tx) => insertNotificationTx(tx, input.userId, input));
    } catch (err) {
      throw internalCause(err);
    }
  }

  async listNotifications(ctx: Ctx, userId: string): Promise<GovNotification[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<{
          id: string;
          user_id: string;
          title: string;
          body: string | null;
          category: string | null;
          read: boolean;
          created_at: Date;
        }>(
          `SELECT id, user_id, title, body, category, read, created_at
             FROM gov_notifications WHERE user_id = $1 ORDER BY created_at DESC`,
          [userId],
        );
        return res.rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          title: r.title,
          body: r.body ?? '',
          category: r.category ?? '',
          read: r.read,
          createdAt: r.created_at,
        }));
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async markNotificationRead(ctx: Ctx, userId: string, id: string): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE gov_notifications SET read = true WHERE id = $1 AND user_id = $2`,
          [id, userId],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('notification not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('notification not found');
  }

  async markAllNotificationsRead(ctx: Ctx, userId: string): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        await tx.query(`UPDATE gov_notifications SET read = true WHERE user_id = $1 AND NOT read`, [
          userId,
        ]);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Төлбөр ────────────────────────────────────────────────────────────

  async listPayments(ctx: Ctx, userId: string): Promise<GovPayment[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<PayRow>(
          `SELECT ${payColumns} FROM gov_payments WHERE user_id = $1
            ORDER BY status, created_at DESC`,
          [userId],
        );
        return res.rows.map(toPayment);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async payPayment(ctx: Ctx, userId: string, id: string): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE gov_payments SET status = 'paid', paid_at = now()
            WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
          [id, userId],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('pending payment not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('pending payment not found');
  }

  // ── Цаг захиалга ──────────────────────────────────────────────────────

  async listAppointments(ctx: Ctx, userId: string): Promise<GovAppointment[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<ApptRow>(
          `SELECT ${apptColumns} FROM gov_appointments WHERE user_id = $1 ORDER BY scheduled_at`,
          [userId],
        );
        return res.rows.map(toAppointment);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async createAppointment(ctx: Ctx, input: NewGovAppointment): Promise<GovAppointment> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<ApptRow>(
          `INSERT INTO gov_appointments
               (user_id, service_id, service_name, agency, location, scheduled_at, status, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${apptColumns}`,
          [
            input.userId,
            input.serviceId,
            input.serviceName,
            input.agency,
            input.location,
            input.scheduledAt,
            input.status,
            input.note,
          ],
        );
        const row = res.rows[0];
        if (!row) throw new Error('create appointment: no row returned');
        return toAppointment(row);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async cancelAppointment(ctx: Ctx, userId: string, id: string): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE gov_appointments SET status = 'cancelled'
            WHERE id = $1 AND user_id = $2 AND status IN ('booked','confirmed')`,
          [id, userId],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('active appointment not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('active appointment not found');
  }

  // ── Нэгтгэл ───────────────────────────────────────────────────────────

  async overview(ctx: Ctx, userId: string): Promise<GovOverview> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<{
          open_apps: string;
          unread: string;
          unpaid_count: string;
          unpaid_amount: string;
          upcoming: string;
          issued_refs: string;
        }>(
          `SELECT
               (SELECT count(*) FROM gov_applications
                 WHERE user_id = $1 AND status IN ('submitted','in_review'))          AS open_apps,
               (SELECT count(*) FROM gov_notifications
                 WHERE user_id = $1 AND NOT read)                                     AS unread,
               (SELECT count(*) FROM gov_payments
                 WHERE user_id = $1 AND status = 'pending')                           AS unpaid_count,
               (SELECT COALESCE(sum(amount),0) FROM gov_payments
                 WHERE user_id = $1 AND status = 'pending')                           AS unpaid_amount,
               (SELECT count(*) FROM gov_appointments
                 WHERE user_id = $1 AND status IN ('booked','confirmed')
                   AND scheduled_at >= now())                                         AS upcoming,
               (SELECT count(*) FROM gov_references
                 WHERE user_id = $1 AND status = 'issued')                            AS issued_refs`,
          [userId],
        );
        const r = res.rows[0];

        const recent = await tx.query<AppRow>(
          `SELECT ${appColumns} FROM gov_applications
            WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 5`,
          [userId],
        );
        const upcoming = await tx.query<ApptRow>(
          `SELECT ${apptColumns} FROM gov_appointments
            WHERE user_id = $1 AND status IN ('booked','confirmed') AND scheduled_at >= now()
            ORDER BY scheduled_at LIMIT 5`,
          [userId],
        );

        return {
          openApplications: num(r?.open_apps ?? '0'),
          unreadNotifications: num(r?.unread ?? '0'),
          unpaidCount: num(r?.unpaid_count ?? '0'),
          unpaidAmount: num(r?.unpaid_amount ?? '0'),
          upcomingCount: num(r?.upcoming ?? '0'),
          issuedReferences: num(r?.issued_refs ?? '0'),
          recentApplications: recent.rows.map(toApplication),
          upcomingAppointments: upcoming.rows.map(toAppointment),
        };
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Demo seed ─────────────────────────────────────────────────────────

  async countUserRows(ctx: Ctx, userId: string): Promise<number> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<{ total: string }>(
          `SELECT
               (SELECT count(*) FROM gov_applications  WHERE user_id = $1) +
               (SELECT count(*) FROM gov_references    WHERE user_id = $1) +
               (SELECT count(*) FROM gov_notifications WHERE user_id = $1) +
               (SELECT count(*) FROM gov_payments      WHERE user_id = $1) +
               (SELECT count(*) FROM gov_appointments  WHERE user_id = $1) AS total`,
          [userId],
        );
        return num(res.rows[0]?.total ?? '0');
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * seedDemoData нь хэрэглэгчид анх ороход жишээ өгөгдөл (мэдэгдэл/төлбөр/цаг)
   * НЭГ RLS транзакцид үүсгэнэ.
   *
   * Транзакц-скоуптай advisory lock (хэрэглэгчээр) нь анх ороход ЗЭРЭГ ирсэн
   * хоёр хүсэлт хоёулаа seed хийж давхар мөр үүсгэхээс (TOCTOU) сэргийлнэ:
   * эхнийх нь lock авч seed хийгээд commit-д гарган суллана, хоёр дахь нь
   * lock авмагц дахин-шалгалтаар мөр байгааг олж чимээгүй буцна.
   *
   * ⚠️ ХҮСЭЛТ болон ЛАВЛАГААГ ЗОРИУДААР seed ХИЙХГҮЙ: хуурамч мөр нь
   * timeline-гүй, service_id-гүй, due_at-гүй "өнчин" бичлэг болж бодит
   * урсгалыг будлиулна. Хүсэлт нь ЗӨВХӨН бодит workflow-оор үүснэ.
   */
  async seedDemoData(ctx: Ctx, userId: string): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [userId]);

        // Lock дор ДАХИН шалгана — өөр хүсэлт аль хэдийн seed хийсэн байж болно.
        const existing = await tx.query<{ total: string }>(
          `SELECT
               (SELECT count(*) FROM gov_applications  WHERE user_id = $1) +
               (SELECT count(*) FROM gov_references    WHERE user_id = $1) +
               (SELECT count(*) FROM gov_notifications WHERE user_id = $1) +
               (SELECT count(*) FROM gov_payments      WHERE user_id = $1) +
               (SELECT count(*) FROM gov_appointments  WHERE user_id = $1) AS total`,
          [userId],
        );
        if (num(existing.rows[0]?.total ?? '0') > 0) return;

        await tx.query(
          `INSERT INTO gov_notifications(user_id, title, body, category, read, created_at) VALUES
           ($1, 'Татварын тодорхойлолт бэлэн боллоо', 'Таны хүссэн татварын тодорхойлолт амжилттай олгогдлоо.', 'success', false, now() - interval '2 hours'),
           ($1, 'Иргэний үнэмлэхний хугацаа дуусч байна', 'Таны иргэний үнэмлэхний хугацаа 30 хоногийн дотор дуусна.', 'warning', false, now() - interval '1 day'),
           ($1, 'Нийгмийн даатгалын шимтгэл', '2026 оны 5-р сарын шимтгэл амжилттай төлөгдлөө.', 'info', true, now() - interval '6 days')`,
          [userId],
        );

        await tx.query(
          `INSERT INTO gov_payments(user_id, title, category, amount, status, due_date, created_at) VALUES
           ($1, 'Авто тээврийн татвар 2026', 'tax', 45000, 'pending', now() + interval '20 days', now() - interval '3 days'),
           ($1, 'Жолооны үнэмлэх сунгалтын хураамж', 'fee', 35000, 'pending', now() + interval '10 days', now() - interval '1 day'),
           ($1, 'Зам хөдөлгөөний торгууль', 'fine', 30000, 'paid', now() - interval '15 days', now() - interval '20 days')`,
          [userId],
        );

        await tx.query(
          `INSERT INTO gov_appointments(user_id, service_name, agency, location, scheduled_at, status, note) VALUES
           ($1, 'Жолооны үнэмлэх сунгах', 'Зам тээврийн төв', 'БЗД, 13-р хороо', now() + interval '5 days' + interval '10 hours', 'booked', '')`,
          [userId],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newGovRepository = (db: Db): GovRepository => new GovPostgres(db);
