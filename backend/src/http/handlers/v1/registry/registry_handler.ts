// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /registry/* болон /catalog/* endpoint-ууд — Ring System · R1, үйлчилгээний
// нэгдсэн регистр.
//
// Уншилт нь `registry.view`, бичилт нь `registry.manage` эрх шаардана
// (route_registry.ts). `/catalog/*` нь ЭРХГҮЙ — нэвтэрсэн дурын иргэн үзнэ;
// оронд нь usecase давхарга ЗӨВХӨН нийтлэгдсэн паспортыг эргүүлнэ.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type {
  RegistryUsecase,
  ServiceInput,
} from '../../../../usecases/registry/registry_usecase.js';
import {
  onceOnlyReportResponse,
  registryEvidenceListResponse,
  registryEvidenceResponse,
  registryLifeEventListResponse,
  registryLifeEventResponse,
  registryOverviewResponse,
  registryServiceListResponse,
  registryServiceResponse,
  registryVersionListResponse,
  registryVersionResponse,
  registryViolationListResponse,
} from '../../../dto/responses/registry.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * serviceSchema нь паспортын body. Утгын НАРИЙН шалгалт (суваг/шат/эрх зүйн
 * автоматжуулалтын шалгуур) нь usecase давхаргад — энд зөвхөн хэлбэр/урт.
 */
const serviceSchema = strictObject({
  code: z.string().max(64).optional(),
  name: z.string().min(1).max(300),
  name_en: z.string().max(300).optional(),
  description: z.string().max(4000).optional(),
  authority: z.string().min(1).max(300),
  authority_org_id: z.string().uuid().nullable().optional(),
  legal_basis: z.string().max(4000).optional(),
  target_group: z.string().max(300).optional(),
  output: z.string().max(300).optional(),
  channels: z.array(z.string().max(32)).optional(),
  fee: z.number().int().optional(),
  max_days: z.number().int().optional(),
  steps_count: z.number().int().optional(),
  annual_volume: z.number().int().optional(),
  proactivity: z.string().max(32).optional(),
  life_event_id: z.string().uuid().nullable().optional(),
  category: z.string().max(120).optional(),
  cofog_code: z.string().max(32).optional(),
  cofog_label: z.string().max(200).optional(),
  main_activity: z.string().max(200).optional(),
  sdg_code: z.string().max(32).optional(),
  processing_time: z.string().max(64).optional(),
  output_type: z.string().max(64).optional(),
  output_ref_type: z.string().max(64).optional(),
  assurance_level: z.string().max(32).optional(),
  fulfilment: z.string().max(16).optional(),
  has_discretion: z.boolean().optional(),
  has_assessment: z.boolean().optional(),
  sla_hours: z.number().int().optional(),
  tacit_approval: z.boolean().optional(),
  online: z.boolean().optional(),
});

const evidencesSchema = strictObject({
  evidences: z
    .array(
      strictObject({
        evidence_id: z.string().uuid(),
        required: z.boolean().optional(),
        from_citizen: z.boolean().optional(),
        note: z.string().max(4000).optional(),
      }),
    )
    .optional(),
});

const publishSchema = strictObject({
  change_note: z.string().max(4000).optional(),
});

const evidenceSchema = strictObject({
  code: z.string().max(64).optional(),
  name: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  holder_agency: z.string().max(300).optional(),
  source_system: z.string().max(300).optional(),
  in_khur: z.boolean().optional(),
  khur_service_code: z.string().max(120).optional(),
});

const lifeEventSchema = strictObject({
  code: z.string().max(64),
  name: z.string().min(1).max(300),
  kind: z.enum(['life', 'business']).optional(),
  description: z.string().max(4000).optional(),
  lead_agency: z.string().max(300).optional(),
  eu_code: z.string().max(32).optional(),
  en_label: z.string().max(300).optional(),
  sort_order: z.number().int().optional(),
});

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

const queryString = (req: Request, key: string): string => {
  const raw: unknown = req.query[key];
  return typeof raw === 'string' ? raw : '';
};

/** filterFrom нь query-гээс жагсаалтын шүүлтүүр угсарна. */
const filterFrom = (req: Request) => ({
  status: queryString(req, 'status'),
  authority: queryString(req, 'authority'),
  lifeEventId: queryString(req, 'life_event_id'),
  proactivity: queryString(req, 'proactivity'),
  query: queryString(req, 'q'),
});

type ServiceBody = z.infer<typeof serviceSchema>;

/** toServiceInput нь HTTP body-г usecase-ийн оролт болгоно. */
const toServiceInput = (b: ServiceBody): ServiceInput => ({
  code: b.code ?? '',
  name: b.name,
  nameEn: b.name_en ?? '',
  description: b.description ?? '',
  authority: b.authority,
  authorityOrgId: b.authority_org_id ?? null,
  legalBasis: b.legal_basis ?? '',
  targetGroup: b.target_group ?? '',
  output: b.output ?? '',
  channels: b.channels ?? [],
  fee: b.fee ?? 0,
  maxDays: b.max_days ?? 0,
  stepsCount: b.steps_count ?? 0,
  annualVolume: b.annual_volume ?? 0,
  proactivity: b.proactivity ?? '',
  lifeEventId: b.life_event_id ?? null,
  category: b.category ?? '',
  cofogCode: b.cofog_code ?? '',
  cofogLabel: b.cofog_label ?? '',
  mainActivity: b.main_activity ?? '',
  sdgCode: b.sdg_code ?? '',
  processingTime: b.processing_time ?? '',
  outputType: b.output_type ?? '',
  outputRefType: b.output_ref_type ?? '',
  assuranceLevel: b.assurance_level ?? '',
  fulfilment: b.fulfilment ?? '',
  hasDiscretion: b.has_discretion ?? false,
  hasAssessment: b.has_assessment ?? false,
  slaHours: b.sla_hours ?? 0,
  tacitApproval: b.tacit_approval ?? false,
  online: b.online ?? false,
});

export class RegistryHandler {
  constructor(private readonly usecase: RegistryUsecase) {}

  // ── Уншилт (registry.view) ────────────────────────────────────────────

  /** GET /registry/overview · 200 */
  overview: AsyncHandler = async (req, res) => {
    const o = await this.usecase.overview(req.ctx);
    newSuccessResponse(req, res, 200, 'registry overview', registryOverviewResponse(o));
  };

  /** GET /registry/services · 200 */
  listServices: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listServices(req.ctx, filterFrom(req));
    newSuccessResponse(req, res, 200, 'services fetched', registryServiceListResponse(list));
  };

  /** GET /registry/services/:id · 200 · 404 */
  getService: AsyncHandler = async (req, res) => {
    const svc = await this.usecase.getService(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'service fetched', registryServiceResponse(svc));
  };

  /** GET /registry/services/:id/versions · 200 */
  listVersions: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listVersions(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'versions fetched', registryVersionListResponse(list));
  };

  /** GET /registry/services/:id/once-only · 200 · 404 */
  checkOnceOnly: AsyncHandler = async (req, res) => {
    const report = await this.usecase.checkOnceOnly(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'once-only check', onceOnlyReportResponse(report));
  };

  /** GET /registry/once-only · 200 */
  onceOnlyViolations: AsyncHandler = async (req, res) => {
    const list = await this.usecase.onceOnlyViolations(req.ctx, queryString(req, 'authority'));
    newSuccessResponse(req, res, 200, 'once-only violations', registryViolationListResponse(list));
  };

  /** GET /registry/evidences · 200 */
  listEvidences: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listEvidences(req.ctx);
    newSuccessResponse(req, res, 200, 'evidences fetched', registryEvidenceListResponse(list));
  };

  /** GET /registry/life-events · 200 */
  listLifeEvents: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listLifeEvents(req.ctx);
    newSuccessResponse(req, res, 200, 'life events fetched', registryLifeEventListResponse(list));
  };

  // ── Нийтийн каталог (эрхгүй, зөвхөн published) ────────────────────────

  /** GET /catalog/services · Bearer · 200 */
  catalog: AsyncHandler = async (req, res) => {
    const list = await this.usecase.publicCatalog(req.ctx, filterFrom(req));
    newSuccessResponse(req, res, 200, 'catalog fetched', registryServiceListResponse(list));
  };

  /** GET /catalog/services/:id · Bearer · 200 · 404 (ноорог бол ч 404) */
  publicService: AsyncHandler = async (req, res) => {
    const svc = await this.usecase.publicService(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'service fetched', registryServiceResponse(svc));
  };

  /** GET /catalog/life-events · Bearer · 200 */
  publicLifeEvents: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listLifeEvents(req.ctx);
    newSuccessResponse(req, res, 200, 'life events fetched', registryLifeEventListResponse(list));
  };

  // ── Бичилт (registry.manage) ──────────────────────────────────────────

  /** POST /registry/services · 201 · 400 · 409 · 422 */
  createService: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, serviceSchema);
    const svc = await this.usecase.createService(req.ctx, toServiceInput(body));
    newSuccessResponse(req, res, 201, 'service created', registryServiceResponse(svc));
  };

  /** PUT /registry/services/:id · 200 · 400 · 404 · 409 · 422 */
  updateService: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, serviceSchema);
    const svc = await this.usecase.updateService(
      req.ctx,
      pathParam(req, 'id'),
      toServiceInput(body),
    );
    newSuccessResponse(req, res, 200, 'service updated', registryServiceResponse(svc));
  };

  /** DELETE /registry/services/:id · 200 · 404 · 409 (нийтлэгдсэнийг устгахгүй) */
  deleteService: AsyncHandler = async (req, res) => {
    await this.usecase.deleteService(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'service deleted');
  };

  /** POST /registry/services/:id/archive · 200 · 404 */
  archiveService: AsyncHandler = async (req, res) => {
    await this.usecase.archiveService(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'service archived');
  };

  /** PUT /registry/services/:id/evidences · 200 · 400 · 404 · 422 */
  setEvidences: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, evidencesSchema);
    const svc = await this.usecase.setEvidences(
      req.ctx,
      pathParam(req, 'id'),
      (body.evidences ?? []).map((e) => ({
        evidenceId: e.evidence_id,
        required: e.required ?? false,
        fromCitizen: e.from_citizen ?? false,
        note: e.note ?? '',
      })),
    );
    newSuccessResponse(req, res, 200, 'evidences updated', registryServiceResponse(svc));
  };

  /**
   * publish нь паспортыг нийтэлж, хувилбар бэхэлж, иргэний каталог руу
   * буулгана. Зарласан проактив байдал нь БОДИТ once-only байдалтай зөрчилдвөл
   * 409 — регистр өөрөө худал мэдээлэл агуулахгүй.
   *
   * POST /registry/services/:id/publish · 200 · 404 · 409 · 422
   */
  publish: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, publishSchema);
    const user = currentUserFromRequest(req);
    const version = await this.usecase.publish(req.ctx, pathParam(req, 'id'), {
      changeNote: body.change_note ?? '',
      publishedBy: user?.id ?? null,
    });
    newSuccessResponse(req, res, 200, 'service published', registryVersionResponse(version));
  };

  /** POST /registry/evidences · 201 · 400 · 409 · 422 */
  createEvidence: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, evidenceSchema);
    const ev = await this.usecase.createEvidence(req.ctx, {
      code: body.code ?? '',
      name: body.name,
      description: body.description ?? '',
      holderAgency: body.holder_agency ?? '',
      sourceSystem: body.source_system ?? '',
      inKhur: body.in_khur ?? false,
      khurServiceCode: body.khur_service_code ?? '',
    });
    newSuccessResponse(req, res, 201, 'evidence created', registryEvidenceResponse(ev));
  };

  /** PUT /registry/evidences/:id · 200 · 400 · 404 · 422 */
  updateEvidence: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, evidenceSchema);
    const ev = await this.usecase.updateEvidence(req.ctx, pathParam(req, 'id'), {
      code: body.code ?? '',
      name: body.name,
      description: body.description ?? '',
      holderAgency: body.holder_agency ?? '',
      sourceSystem: body.source_system ?? '',
      inKhur: body.in_khur ?? false,
      khurServiceCode: body.khur_service_code ?? '',
    });
    newSuccessResponse(req, res, 200, 'evidence updated', registryEvidenceResponse(ev));
  };

  /** DELETE /registry/evidences/:id · 200 · 400 (холбоотой бол) · 404 */
  deleteEvidence: AsyncHandler = async (req, res) => {
    await this.usecase.deleteEvidence(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'evidence deleted');
  };

  /** POST /registry/life-events · 201 · 400 · 409 · 422 */
  createLifeEvent: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, lifeEventSchema);
    const ev = await this.usecase.createLifeEvent(req.ctx, {
      code: body.code,
      name: body.name,
      kind: body.kind ?? 'life',
      description: body.description ?? '',
      leadAgency: body.lead_agency ?? '',
      euCode: body.eu_code ?? '',
      enLabel: body.en_label ?? '',
      sortOrder: body.sort_order ?? 0,
    });
    newSuccessResponse(req, res, 201, 'life event created', registryLifeEventResponse(ev));
  };

  /** DELETE /registry/life-events/:id · 200 · 404 */
  deleteLifeEvent: AsyncHandler = async (req, res) => {
    await this.usecase.deleteLifeEvent(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'life event deleted');
  };
}

export const newRegistryHandler = (usecase: RegistryUsecase): RegistryHandler =>
  new RegistryHandler(usecase);
