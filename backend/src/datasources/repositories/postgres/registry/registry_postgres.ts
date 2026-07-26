// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Ring System · R1 — Үйлчилгээний нэгдсэн регистрийн Postgres gateway.
//
// Эдгээр хүснэгтүүд нь БАЙГУУЛЛАГЫН мастер өгөгдөл (хэрэглэгч-тус-бүрийн БИШ)
// тул gateway/relay-ийн адил RLS-гүй; хамгаалалт нь route давхаргад
// `registry.view` / `registry.manage` эрхээр хийгдэнэ.
//
// ORM-ГҮЙ: бүх query нь гараар бичсэн, параметржүүлсэн SQL.

import { badRequest, conflict, internalCause, notFound } from '../../../../apperror/index.js';
import type {
  RegistryEvidence,
  RegistryLifeEvent,
  RegistryOnceOnlyViolation,
  RegistryOverview,
  RegistryService,
  RegistryServiceEvidence,
  RegistryServiceVersion,
} from '../../../../domain/registry.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import { isUniqueViolation, pgErrorCode, type Db } from '../../../drivers/pg.js';
import type {
  NewRegistryEvidence,
  NewRegistryLifeEvent,
  NewRegistryService,
  NewRegistryVersion,
  RegistryFilter,
  RegistryRepository,
} from '../../interface/registry.js';

const serviceColumns = `id, code, name, name_en, description, authority, authority_org_id, legal_basis,
  target_group, output, channels, fee, max_days, steps_count, annual_volume, proactivity, status,
  life_event_id, category, cofog_code, cofog_label, main_activity, sdg_code, processing_time,
  output_type, output_ref_type, assurance_level, fulfilment, has_discretion, has_assessment,
  sla_hours, tacit_approval, online, version, published_at, created_at, updated_at`;

const versionColumns = `id, service_id, version, snapshot, change_note, is_baseline, steps_count,
  documents_count, max_days, fee, delta_steps, delta_documents, delta_days, delta_fee,
  published_at, published_by`;

const evidenceColumns = `id, code, name, description, holder_agency, source_system, in_khur,
  khur_service_code, created_at, updated_at`;

const lifeEventColumns = `id, code, name, kind, description, lead_agency, eu_code, en_label,
  sort_order, created_at`;

interface ServiceRow {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  description: string | null;
  authority: string | null;
  authority_org_id: string | null;
  legal_basis: string | null;
  target_group: string | null;
  output: string | null;
  channels: string[] | null;
  fee: number;
  max_days: number;
  steps_count: number;
  annual_volume: number;
  proactivity: string;
  status: string;
  life_event_id: string | null;
  category: string | null;
  cofog_code: string | null;
  cofog_label: string | null;
  main_activity: string | null;
  sdg_code: string | null;
  processing_time: string | null;
  output_type: string | null;
  output_ref_type: string | null;
  assurance_level: string | null;
  fulfilment: string | null;
  has_discretion: boolean;
  has_assessment: boolean;
  sla_hours: number;
  tacit_approval: boolean;
  online: boolean;
  version: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

const toService = (r: ServiceRow): RegistryService => ({
  id: r.id,
  code: r.code,
  name: r.name,
  nameEn: r.name_en ?? '',
  description: r.description ?? '',
  authority: r.authority ?? '',
  authorityOrgId: r.authority_org_id,
  legalBasis: r.legal_basis ?? '',
  targetGroup: r.target_group ?? '',
  output: r.output ?? '',
  channels: r.channels ?? [],
  fee: r.fee,
  maxDays: r.max_days,
  stepsCount: r.steps_count,
  annualVolume: r.annual_volume,
  proactivity: r.proactivity,
  status: r.status,
  lifeEventId: r.life_event_id,
  category: r.category ?? '',
  cofogCode: r.cofog_code ?? '',
  cofogLabel: r.cofog_label ?? '',
  mainActivity: r.main_activity ?? '',
  sdgCode: r.sdg_code ?? '',
  processingTime: r.processing_time ?? '',
  outputType: r.output_type ?? '',
  outputRefType: r.output_ref_type ?? '',
  assuranceLevel: r.assurance_level ?? '',
  fulfilment: r.fulfilment ?? '',
  hasDiscretion: r.has_discretion,
  hasAssessment: r.has_assessment,
  slaHours: r.sla_hours,
  tacitApproval: r.tacit_approval,
  online: r.online,
  version: r.version,
  publishedAt: r.published_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  evidences: [],
});

interface VersionRow {
  id: string;
  service_id: string;
  version: number;
  snapshot: Record<string, unknown> | null;
  change_note: string | null;
  is_baseline: boolean;
  steps_count: number;
  documents_count: number;
  max_days: number;
  fee: number;
  delta_steps: number;
  delta_documents: number;
  delta_days: number;
  delta_fee: number;
  published_at: Date;
  published_by: string | null;
}

const toVersion = (r: VersionRow): RegistryServiceVersion => ({
  id: r.id,
  serviceId: r.service_id,
  version: r.version,
  snapshot: r.snapshot,
  changeNote: r.change_note ?? '',
  isBaseline: r.is_baseline,
  stepsCount: r.steps_count,
  documentsCount: r.documents_count,
  maxDays: r.max_days,
  fee: r.fee,
  deltaSteps: r.delta_steps,
  deltaDocuments: r.delta_documents,
  deltaDays: r.delta_days,
  deltaFee: r.delta_fee,
  publishedAt: r.published_at,
  publishedBy: r.published_by,
});

interface EvidenceRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  holder_agency: string | null;
  source_system: string | null;
  in_khur: boolean;
  khur_service_code: string | null;
  created_at: Date;
  updated_at: Date | null;
}

const toEvidence = (r: EvidenceRow): RegistryEvidence => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description ?? '',
  holderAgency: r.holder_agency ?? '',
  sourceSystem: r.source_system ?? '',
  inKhur: r.in_khur,
  khurServiceCode: r.khur_service_code ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

interface LifeEventRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  description: string | null;
  lead_agency: string | null;
  eu_code: string | null;
  en_label: string | null;
  sort_order: number;
  created_at: Date;
}

const toLifeEvent = (r: LifeEventRow): RegistryLifeEvent => ({
  id: r.id,
  code: r.code,
  name: r.name,
  kind: r.kind,
  description: r.description ?? '',
  leadAgency: r.lead_agency ?? '',
  euCode: r.eu_code ?? '',
  enLabel: r.en_label ?? '',
  sortOrder: r.sort_order,
  createdAt: r.created_at,
});

/** isInvalidUuid нь uuid биш текстийг (22P02) таана — 500 биш, "олдсонгүй". */
const isInvalidUuid = (err: unknown): boolean => pgErrorCode(err) === '22P02';
/** isForeignKeyViolation нь FK зөрчлийг таана. */
const isForeignKeyViolation = (err: unknown): boolean => pgErrorCode(err) === '23503';

/** num нь bigint-ийн мөр хэлбэрийг тоо болгоно (count/sum нь мөрөөр ирдэг). */
const num = (v: string | number | null): number =>
  typeof v === 'number' ? v : Number.parseFloat(v ?? '0');

class RegistryPostgres implements RegistryRepository {
  constructor(private readonly db: Db) {}

  // ── Паспорт ───────────────────────────────────────────────────────────

  async listServices(ctx: Ctx, filter: RegistryFilter): Promise<RegistryService[]> {
    // Шүүлтүүрийг ЗӨВХӨН байрлалын параметрээр угсарна — хэрэглэгчийн утга
    // хэзээ ч SQL текстэд ордоггүй тул injection боломжгүй.
    const where: string[] = [];
    const args: unknown[] = [];
    const ph = (val: unknown): string => {
      args.push(val);
      return `$${String(args.length)}`;
    };

    if (filter.publishedOnly) where.push(`status = 'published'`);
    else if (filter.status !== '') where.push(`status = ${ph(filter.status)}`);
    if (filter.authority !== '') where.push(`authority = ${ph(filter.authority)}`);
    if (filter.lifeEventId !== '') where.push(`life_event_id = ${ph(filter.lifeEventId)}`);
    if (filter.proactivity !== '') where.push(`proactivity = ${ph(filter.proactivity)}`);
    const q = filter.query.trim();
    if (q !== '') {
      // Нэг аргументыг ХОЁР баганад ашиглана (ижил $N).
      const p = ph(q);
      where.push(`(name ILIKE '%' || ${p} || '%' OR code ILIKE '%' || ${p} || '%')`);
    }

    let sql = `SELECT ${serviceColumns} FROM registry_services`;
    if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY status, name`;

    try {
      const res = await this.db.query<ServiceRow>(ctx, sql, args);
      return res.rows.map(toService);
    } catch (err) {
      if (isInvalidUuid(err)) return [];
      throw internalCause(err);
    }
  }

  async getService(ctx: Ctx, id: string): Promise<RegistryService> {
    let res;
    try {
      res = await this.db.query<ServiceRow>(
        ctx,
        `SELECT ${serviceColumns} FROM registry_services WHERE id = $1`,
        [id],
      );
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('service not found');
    const service = toService(row);
    service.evidences = await this.serviceEvidences(ctx, id);
    return service;
  }

  async createService(ctx: Ctx, input: NewRegistryService): Promise<RegistryService> {
    try {
      const res = await this.db.query<ServiceRow>(
        ctx,
        `INSERT INTO registry_services
             (code, name, name_en, description, authority, authority_org_id, legal_basis, target_group,
              output, channels, fee, max_days, steps_count, annual_volume, proactivity, status, life_event_id,
              category, cofog_code, cofog_label, main_activity, sdg_code, processing_time,
              output_type, output_ref_type, assurance_level, fulfilment, has_discretion, has_assessment,
              sla_hours, tacit_approval, online)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
         RETURNING ${serviceColumns}`,
        serviceArgs(input, null),
      );
      const row = res.rows[0];
      if (!row) throw new Error('create service: no row returned');
      return toService(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('service code already exists');
      if (isForeignKeyViolation(err)) throw badRequest('unknown life event or organization');
      throw internalCause(err);
    }
  }

  async updateService(ctx: Ctx, id: string, input: NewRegistryService): Promise<RegistryService> {
    let res;
    try {
      // code-д ЗОРИУДААР хүрэхгүй — паспортын код өөрчлөгддөггүй (түүхэн
      // мөрдөлт тасрахаас сэргийлнэ); status-ыг publish/archive л сольдог.
      res = await this.db.query<ServiceRow>(
        ctx,
        `UPDATE registry_services SET
             name = $2, name_en = $3, description = $4, authority = $5, authority_org_id = $6,
             legal_basis = $7, target_group = $8, output = $9, channels = $10, fee = $11,
             max_days = $12, steps_count = $13, annual_volume = $14, proactivity = $15,
             life_event_id = $16,
             category = $17, cofog_code = $18, cofog_label = $19, main_activity = $20,
             sdg_code = $21, processing_time = $22, output_type = $23, output_ref_type = $24,
             assurance_level = $25, fulfilment = $26, has_discretion = $27, has_assessment = $28,
             sla_hours = $29, tacit_approval = $30, online = $31,
             updated_at = now()
           WHERE id = $1
           RETURNING ${serviceColumns}`,
        updateArgs(id, input),
      );
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      if (isForeignKeyViolation(err)) throw badRequest('unknown life event or organization');
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('service not found');
    return toService(row);
  }

  async setServiceStatus(ctx: Ctx, id: string, status: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(
        ctx,
        `UPDATE registry_services SET status = $2, updated_at = now() WHERE id = $1`,
        [id, status],
      );
      affected = res.rowCount ?? 0;
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('service not found');
  }

  async deleteService(ctx: Ctx, id: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(ctx, `DELETE FROM registry_services WHERE id = $1`, [id]);
      affected = res.rowCount ?? 0;
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('service not found');
  }

  // ── Паспорт ↔ нотолгоо ────────────────────────────────────────────────

  private async serviceEvidences(ctx: Ctx, serviceId: string): Promise<RegistryServiceEvidence[]> {
    const res = await this.db.query<{
      id: string;
      code: string;
      name: string;
      required: boolean;
      from_citizen: boolean;
      in_khur: boolean;
      note: string | null;
    }>(
      ctx,
      `SELECT e.id, e.code, e.name, se.required, se.from_citizen, e.in_khur, se.note
         FROM registry_service_evidences se
         JOIN registry_evidences e ON e.id = se.evidence_id
        WHERE se.service_id = $1
        ORDER BY e.name`,
      [serviceId],
    );
    return res.rows.map((r) => ({
      evidenceId: r.id,
      code: r.code,
      name: r.name,
      required: r.required,
      fromCitizen: r.from_citizen,
      inKhur: r.in_khur,
      note: r.note ?? '',
    }));
  }

  /**
   * setServiceEvidences нь бүрэн жагсаалтыг НЭГ транзакцид солино: бүтэлгүйтвэл
   * хуучин жагсаалт бүрэн бүтэн үлдэнэ (хагас устгагдсан төлөв ҮҮСЭХГҮЙ).
   */
  async setServiceEvidences(
    ctx: Ctx,
    serviceId: string,
    list: { evidenceId: string; required: boolean; fromCitizen: boolean; note: string }[],
  ): Promise<void> {
    try {
      await this.db.withTx(ctx, async (tx) => {
        const exists = await tx.query<{ exists: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM registry_services WHERE id = $1) AS exists`,
          [serviceId],
        );
        if (exists.rows[0]?.exists !== true) throw notFound('service not found');

        await tx.query(`DELETE FROM registry_service_evidences WHERE service_id = $1`, [serviceId]);
        for (const e of list) {
          try {
            await tx.query(
              `INSERT INTO registry_service_evidences
                   (service_id, evidence_id, required, from_citizen, note)
               VALUES ($1,$2,$3,$4,$5)`,
              [serviceId, e.evidenceId, e.required, e.fromCitizen, e.note],
            );
          } catch (err) {
            if (isForeignKeyViolation(err) || isInvalidUuid(err)) {
              throw badRequest(`unknown evidence: ${e.evidenceId}`);
            }
            throw err;
          }
        }
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'DomainError') throw err;
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
  }

  async countCitizenDocuments(ctx: Ctx, serviceId: string): Promise<number> {
    try {
      const res = await this.db.query<{ count: string }>(
        ctx,
        `SELECT count(*) AS count FROM registry_service_evidences
          WHERE service_id = $1 AND from_citizen`,
        [serviceId],
      );
      return num(res.rows[0]?.count ?? '0');
    } catch (err) {
      if (isInvalidUuid(err)) return 0;
      throw internalCause(err);
    }
  }

  // ── Хувилбар ──────────────────────────────────────────────────────────

  async listVersions(ctx: Ctx, serviceId: string): Promise<RegistryServiceVersion[]> {
    try {
      const res = await this.db.query<VersionRow>(
        ctx,
        `SELECT ${versionColumns} FROM registry_service_versions
          WHERE service_id = $1 ORDER BY version DESC`,
        [serviceId],
      );
      return res.rows.map(toVersion);
    } catch (err) {
      if (isInvalidUuid(err)) return [];
      throw internalCause(err);
    }
  }

  async baselineVersion(ctx: Ctx, serviceId: string): Promise<RegistryServiceVersion | null> {
    try {
      const res = await this.db.query<VersionRow>(
        ctx,
        `SELECT ${versionColumns} FROM registry_service_versions
          WHERE service_id = $1 AND is_baseline
          ORDER BY version LIMIT 1`,
        [serviceId],
      );
      const row = res.rows[0];
      return row ? toVersion(row) : null;
    } catch (err) {
      if (isInvalidUuid(err)) return null;
      throw internalCause(err);
    }
  }

  async publishVersion(ctx: Ctx, input: NewRegistryVersion): Promise<RegistryServiceVersion> {
    try {
      return await this.db.withTx(ctx, async (tx) => {
        // Зэрэгцээ нийтлэлтийг ЦУВУУЛНА (мөрийн түгжээ) — эс бөгөөс хоёр
        // нийтлэлт ижил дугаартай хувилбар үүсгэнэ.
        const exists = await tx.query<{ id: string }>(
          `SELECT id FROM registry_services WHERE id = $1 FOR UPDATE`,
          [input.serviceId],
        );
        if (!exists.rows[0]) throw notFound('service not found');

        const res = await tx.query<VersionRow>(
          `INSERT INTO registry_service_versions
               (service_id, version, snapshot, change_note, is_baseline, steps_count, documents_count,
                max_days, fee, delta_steps, delta_documents, delta_days, delta_fee, published_by)
           VALUES ($1,
               (SELECT COALESCE(max(version), 0) + 1 FROM registry_service_versions WHERE service_id = $1),
               $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING ${versionColumns}`,
          [
            input.serviceId,
            input.snapshot ?? {},
            input.changeNote,
            input.isBaseline,
            input.stepsCount,
            input.documentsCount,
            input.maxDays,
            input.fee,
            input.deltaSteps,
            input.deltaDocuments,
            input.deltaDays,
            input.deltaFee,
            input.publishedBy,
          ],
        );
        const row = res.rows[0];
        if (!row) throw new Error('publish version: no row returned');

        await tx.query(
          `UPDATE registry_services
              SET version = $2, status = 'published', published_at = now(), updated_at = now()
            WHERE id = $1`,
          [input.serviceId, row.version],
        );
        return toVersion(row);
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'DomainError') throw err;
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
  }

  // ── Ажлын каталог руу проекц ──────────────────────────────────────────
  //
  // Регистр нь үйлчилгээний ЦОРЫН ГАНЦ эх сурвалж; gov_services нь түүний
  // ажлын проекц. Паспортыг нийтлэх бүрд энэ ажиллаж, иргэний портал дээрх
  // үйлчилгээг паспортын одоогийн агуулгатай тэнцүүлнэ.

  async projectToGov(ctx: Ctx, serviceId: string): Promise<void> {
    try {
      // evidence нь ИРГЭНЭЭС шаардаж буй (from_citizen) баримтуудаар автоматаар
      // бүрдэнэ — once-only зөрчлийг засмагц иргэний харагдац шууд цэвэрлэгдэнэ.
      await this.db.query(
        ctx,
        `INSERT INTO gov_services
             (code, name, category, agency, description, fee, processing_days, online,
              cofog_code, cofog_label, main_activity, sdg_code, processing_time,
              output_type, output_ref_type, evidence, legal_basis, assurance_level,
              lifecycle, fulfilment, has_discretion, has_assessment, sla_hours,
              tacit_approval, enabled, registry_service_id)
         SELECT
             r.code, r.name, r.category, r.authority, r.description, r.fee, r.max_days,
             'e-mongolia' = ANY(r.channels),
             r.cofog_code, r.cofog_label, r.main_activity, r.sdg_code, r.processing_time,
             r.output_type, r.output_ref_type,
             COALESCE((
                 SELECT jsonb_agg(e.name ORDER BY e.name)
                   FROM registry_service_evidences se
                   JOIN registry_evidences e ON e.id = se.evidence_id
                  WHERE se.service_id = r.id AND se.from_citizen
             ), '[]'::jsonb),
             r.legal_basis, r.assurance_level,
             'active', r.fulfilment, r.has_discretion, r.has_assessment, r.sla_hours,
             r.tacit_approval, true, r.id
         FROM registry_services r
         WHERE r.id = $1
         ON CONFLICT (registry_service_id) DO UPDATE SET
             code            = EXCLUDED.code,
             name            = EXCLUDED.name,
             category        = EXCLUDED.category,
             agency          = EXCLUDED.agency,
             description     = EXCLUDED.description,
             fee             = EXCLUDED.fee,
             processing_days = EXCLUDED.processing_days,
             online          = EXCLUDED.online,
             cofog_code      = EXCLUDED.cofog_code,
             cofog_label     = EXCLUDED.cofog_label,
             main_activity   = EXCLUDED.main_activity,
             sdg_code        = EXCLUDED.sdg_code,
             processing_time = EXCLUDED.processing_time,
             output_type     = EXCLUDED.output_type,
             output_ref_type = EXCLUDED.output_ref_type,
             evidence        = EXCLUDED.evidence,
             legal_basis     = EXCLUDED.legal_basis,
             assurance_level = EXCLUDED.assurance_level,
             lifecycle       = 'active',
             fulfilment      = EXCLUDED.fulfilment,
             has_discretion  = EXCLUDED.has_discretion,
             has_assessment  = EXCLUDED.has_assessment,
             sla_hours       = EXCLUDED.sla_hours,
             tacit_approval  = EXCLUDED.tacit_approval,
             enabled         = true`,
        [serviceId],
      );
    } catch (err) {
      // code нь ӨӨР (холбогдоогүй) мөрөнд аль хэдийн эзэмшигдсэн.
      if (isUniqueViolation(err)) {
        throw conflict('энэ кодтой ажлын үйлчилгээ аль хэдийн байна');
      }
      throw internalCause(err);
    }
  }

  /**
   * withdrawFromGov нь архивлагдсан паспортын ажлын үйлчилгээг УНТРААНА. Мөрийг
   * УСТГАХГҮЙ: иргэний хүсэлтүүд түүн рүү заасаар байгаа тул устгавал түүх
   * тасарна. `enabled=false` болгосноор каталогт харагдахаа болино.
   */
  async withdrawFromGov(ctx: Ctx, serviceId: string): Promise<void> {
    try {
      await this.db.query(
        ctx,
        `UPDATE gov_services SET enabled = false, lifecycle = 'withdrawn'
          WHERE registry_service_id = $1`,
        [serviceId],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Нотолгооны каталог ────────────────────────────────────────────────

  async listEvidences(ctx: Ctx): Promise<RegistryEvidence[]> {
    try {
      const res = await this.db.query<EvidenceRow>(
        ctx,
        `SELECT ${evidenceColumns} FROM registry_evidences ORDER BY name`,
      );
      return res.rows.map(toEvidence);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async createEvidence(ctx: Ctx, input: NewRegistryEvidence): Promise<RegistryEvidence> {
    try {
      const res = await this.db.query<EvidenceRow>(
        ctx,
        `INSERT INTO registry_evidences
             (code, name, description, holder_agency, source_system, in_khur, khur_service_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING ${evidenceColumns}`,
        [
          input.code,
          input.name,
          input.description,
          input.holderAgency,
          input.sourceSystem,
          input.inKhur,
          input.khurServiceCode,
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error('create evidence: no row returned');
      return toEvidence(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('evidence code already exists');
      throw internalCause(err);
    }
  }

  async updateEvidence(
    ctx: Ctx,
    id: string,
    input: NewRegistryEvidence,
  ): Promise<RegistryEvidence> {
    let res;
    try {
      res = await this.db.query<EvidenceRow>(
        ctx,
        `UPDATE registry_evidences SET
             name = $2, description = $3, holder_agency = $4, source_system = $5,
             in_khur = $6, khur_service_code = $7, updated_at = now()
           WHERE id = $1
           RETURNING ${evidenceColumns}`,
        [
          id,
          input.name,
          input.description,
          input.holderAgency,
          input.sourceSystem,
          input.inKhur,
          input.khurServiceCode,
        ],
      );
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('evidence not found');
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('evidence not found');
    return toEvidence(row);
  }

  async deleteEvidence(ctx: Ctx, id: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(ctx, `DELETE FROM registry_evidences WHERE id = $1`, [id]);
      affected = res.rowCount ?? 0;
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('evidence not found');
      // Паспортод холбогдсон нотолгоог устгах гэвэл FK нь зогсооно.
      if (isForeignKeyViolation(err)) {
        throw badRequest('evidence is still linked to a service');
      }
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('evidence not found');
  }

  // ── Амьдралын үйл явдал ───────────────────────────────────────────────

  async listLifeEvents(ctx: Ctx): Promise<RegistryLifeEvent[]> {
    try {
      const res = await this.db.query<LifeEventRow>(
        ctx,
        `SELECT ${lifeEventColumns} FROM registry_life_events ORDER BY sort_order, name`,
      );
      return res.rows.map(toLifeEvent);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async createLifeEvent(ctx: Ctx, input: NewRegistryLifeEvent): Promise<RegistryLifeEvent> {
    try {
      const res = await this.db.query<LifeEventRow>(
        ctx,
        `INSERT INTO registry_life_events
             (code, name, kind, description, lead_agency, eu_code, en_label, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING ${lifeEventColumns}`,
        [
          input.code,
          input.name,
          input.kind,
          input.description,
          input.leadAgency,
          input.euCode,
          input.enLabel,
          input.sortOrder,
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error('create life event: no row returned');
      return toLifeEvent(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('life event code already exists');
      throw internalCause(err);
    }
  }

  async deleteLifeEvent(ctx: Ctx, id: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(ctx, `DELETE FROM registry_life_events WHERE id = $1`, [id]);
      affected = res.rowCount ?? 0;
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('life event not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('life event not found');
  }

  // ── Once-only + нэгтгэл ───────────────────────────────────────────────

  async onceOnlyViolations(ctx: Ctx, authority: string): Promise<RegistryOnceOnlyViolation[]> {
    let sql = `SELECT service_id, service_code, service_name, authority, service_status,
                      evidence_id, evidence_code, evidence_name, holder_agency,
                      khur_service_code, annual_volume
                 FROM registry_once_only_violations`;
    const args: unknown[] = [];
    if (authority !== '') {
      sql += ` WHERE authority = $1`;
      args.push(authority);
    }
    sql += ` ORDER BY annual_volume DESC, service_name, evidence_name`;

    try {
      const res = await this.db.query<{
        service_id: string;
        service_code: string;
        service_name: string;
        authority: string | null;
        service_status: string;
        evidence_id: string;
        evidence_code: string;
        evidence_name: string;
        holder_agency: string | null;
        khur_service_code: string | null;
        annual_volume: number;
      }>(ctx, sql, args);
      return res.rows.map((r) => ({
        serviceId: r.service_id,
        serviceCode: r.service_code,
        serviceName: r.service_name,
        authority: r.authority ?? '',
        serviceStatus: r.service_status,
        evidenceId: r.evidence_id,
        evidenceCode: r.evidence_code,
        evidenceName: r.evidence_name,
        holderAgency: r.holder_agency ?? '',
        khurServiceCode: r.khur_service_code ?? '',
        annualVolume: r.annual_volume,
      }));
    } catch (err) {
      throw internalCause(err);
    }
  }

  async overview(ctx: Ctx): Promise<RegistryOverview> {
    try {
      const res = await this.db.query<{
        total: string;
        published: string;
        draft: string;
        life_events: string;
        evidences: string;
        in_khur: string;
        violations: string;
        annual_hits: string;
        avg_days: string;
      }>(
        ctx,
        `SELECT
             (SELECT count(*) FROM registry_services)                                   AS total,
             (SELECT count(*) FROM registry_services WHERE status = 'published')        AS published,
             (SELECT count(*) FROM registry_services WHERE status = 'draft')            AS draft,
             (SELECT count(*) FROM registry_life_events)                                AS life_events,
             (SELECT count(*) FROM registry_evidences)                                  AS evidences,
             (SELECT count(*) FROM registry_evidences WHERE in_khur)                    AS in_khur,
             (SELECT count(*) FROM registry_once_only_violations)                       AS violations,
             (SELECT COALESCE(sum(annual_volume), 0) FROM registry_once_only_violations) AS annual_hits,
             (SELECT COALESCE(avg(max_days), 0) FROM registry_services WHERE status = 'published') AS avg_days`,
      );
      const r = res.rows[0];
      if (!r) throw new Error('overview: no row returned');

      const buckets = await this.db.query<{ proactivity: string; count: string }>(
        ctx,
        `SELECT proactivity, count(*) AS count FROM registry_services GROUP BY proactivity`,
      );
      const byProactivity: Record<string, number> = {};
      for (const b of buckets.rows) byProactivity[b.proactivity] = num(b.count);

      return {
        totalServices: num(r.total),
        publishedServices: num(r.published),
        draftServices: num(r.draft),
        lifeEvents: num(r.life_events),
        evidences: num(r.evidences),
        evidencesInKhur: num(r.in_khur),
        onceOnlyViolations: num(r.violations),
        onceOnlyAnnualHits: num(r.annual_hits),
        byProactivity,
        avgMaxDays: num(r.avg_days),
      };
    } catch (err) {
      throw internalCause(err);
    }
  }
}

/** serviceArgs нь INSERT-ийн 32 параметрийг домэйн оролтоос угсарна. */
function serviceArgs(input: NewRegistryService, _unused: null): unknown[] {
  return [
    input.code,
    input.name,
    input.nameEn,
    input.description,
    input.authority,
    input.authorityOrgId,
    input.legalBasis,
    input.targetGroup,
    input.output,
    input.channels,
    input.fee,
    input.maxDays,
    input.stepsCount,
    input.annualVolume,
    input.proactivity,
    input.status,
    input.lifeEventId,
    input.category,
    input.cofogCode,
    input.cofogLabel,
    input.mainActivity,
    input.sdgCode,
    input.processingTime,
    input.outputType,
    input.outputRefType,
    input.assuranceLevel,
    input.fulfilment,
    input.hasDiscretion,
    input.hasAssessment,
    input.slaHours,
    input.tacitApproval,
    input.online,
  ];
}

/** updateArgs нь UPDATE-ийн 31 параметрийг угсарна (code/status ОРОХГҮЙ). */
function updateArgs(id: string, input: NewRegistryService): unknown[] {
  return [
    id,
    input.name,
    input.nameEn,
    input.description,
    input.authority,
    input.authorityOrgId,
    input.legalBasis,
    input.targetGroup,
    input.output,
    input.channels,
    input.fee,
    input.maxDays,
    input.stepsCount,
    input.annualVolume,
    input.proactivity,
    input.lifeEventId,
    input.category,
    input.cofogCode,
    input.cofogLabel,
    input.mainActivity,
    input.sdgCode,
    input.processingTime,
    input.outputType,
    input.outputRefType,
    input.assuranceLevel,
    input.fulfilment,
    input.hasDiscretion,
    input.hasAssessment,
    input.slaHours,
    input.tacitApproval,
    input.online,
  ];
}

export const newRegistryRepository = (db: Db): RegistryRepository => new RegistryPostgres(db);
