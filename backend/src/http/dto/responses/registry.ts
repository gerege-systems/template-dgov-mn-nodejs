// Government Template Platform V3.0
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
import type { OnceOnlyReport } from '../../../usecases/registry/registry_usecase.js';

export interface RegistryServiceEvidenceResponse {
  evidence_id: string;
  code: string;
  name: string;
  required: boolean;
  from_citizen: boolean;
  in_khur: boolean;
  note: string;
}

const evidenceLinkResponse = (e: RegistryServiceEvidence): RegistryServiceEvidenceResponse => ({
  evidence_id: e.evidenceId,
  code: e.code,
  name: e.name,
  required: e.required,
  from_citizen: e.fromCitizen,
  in_khur: e.inKhur,
  note: e.note,
});

export interface RegistryServiceResponse {
  id: string;
  code: string;
  name: string;
  name_en: string;
  description: string;
  authority: string;
  authority_org_id: string | null;
  legal_basis: string;
  target_group: string;
  output: string;
  channels: string[];
  fee: number;
  max_days: number;
  steps_count: number;
  annual_volume: number;
  proactivity: string;
  status: string;
  life_event_id: string | null;
  category: string;
  cofog_code: string;
  cofog_label: string;
  main_activity: string;
  sdg_code: string;
  processing_time: string;
  output_type: string;
  output_ref_type: string;
  assurance_level: string;
  fulfilment: string;
  has_discretion: boolean;
  has_assessment: boolean;
  sla_hours: number;
  tacit_approval: boolean;
  online: boolean;
  version: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
  evidences: RegistryServiceEvidenceResponse[];
}

export const registryServiceResponse = (s: RegistryService): RegistryServiceResponse => ({
  id: s.id,
  code: s.code,
  name: s.name,
  name_en: s.nameEn,
  description: s.description,
  authority: s.authority,
  authority_org_id: s.authorityOrgId,
  legal_basis: s.legalBasis,
  target_group: s.targetGroup,
  output: s.output,
  channels: s.channels,
  fee: s.fee,
  max_days: s.maxDays,
  steps_count: s.stepsCount,
  annual_volume: s.annualVolume,
  proactivity: s.proactivity,
  status: s.status,
  life_event_id: s.lifeEventId,
  category: s.category,
  cofog_code: s.cofogCode,
  cofog_label: s.cofogLabel,
  main_activity: s.mainActivity,
  sdg_code: s.sdgCode,
  processing_time: s.processingTime,
  output_type: s.outputType,
  output_ref_type: s.outputRefType,
  assurance_level: s.assuranceLevel,
  fulfilment: s.fulfilment,
  has_discretion: s.hasDiscretion,
  has_assessment: s.hasAssessment,
  sla_hours: s.slaHours,
  tacit_approval: s.tacitApproval,
  online: s.online,
  version: s.version,
  published_at: s.publishedAt,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
  evidences: s.evidences.map(evidenceLinkResponse),
});

export const registryServiceListResponse = (list: RegistryService[]): RegistryServiceResponse[] =>
  list.map(registryServiceResponse);

export const registryEvidenceResponse = (e: RegistryEvidence) => ({
  id: e.id,
  code: e.code,
  name: e.name,
  description: e.description,
  holder_agency: e.holderAgency,
  source_system: e.sourceSystem,
  in_khur: e.inKhur,
  khur_service_code: e.khurServiceCode,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

export const registryEvidenceListResponse = (list: RegistryEvidence[]) =>
  list.map(registryEvidenceResponse);

export const registryLifeEventResponse = (e: RegistryLifeEvent) => ({
  id: e.id,
  code: e.code,
  name: e.name,
  kind: e.kind,
  description: e.description,
  lead_agency: e.leadAgency,
  eu_code: e.euCode,
  en_label: e.enLabel,
  sort_order: e.sortOrder,
  created_at: e.createdAt,
});

export const registryLifeEventListResponse = (list: RegistryLifeEvent[]) =>
  list.map(registryLifeEventResponse);

export const registryVersionResponse = (v: RegistryServiceVersion) => ({
  id: v.id,
  service_id: v.serviceId,
  version: v.version,
  snapshot: v.snapshot,
  change_note: v.changeNote,
  is_baseline: v.isBaseline,
  steps_count: v.stepsCount,
  documents_count: v.documentsCount,
  max_days: v.maxDays,
  fee: v.fee,
  delta_steps: v.deltaSteps,
  delta_documents: v.deltaDocuments,
  delta_days: v.deltaDays,
  delta_fee: v.deltaFee,
  published_at: v.publishedAt,
  published_by: v.publishedBy,
});

export const registryVersionListResponse = (list: RegistryServiceVersion[]) =>
  list.map(registryVersionResponse);

export const registryViolationListResponse = (list: RegistryOnceOnlyViolation[]) =>
  list.map((v) => ({
    service_id: v.serviceId,
    service_code: v.serviceCode,
    service_name: v.serviceName,
    authority: v.authority,
    service_status: v.serviceStatus,
    evidence_id: v.evidenceId,
    evidence_code: v.evidenceCode,
    evidence_name: v.evidenceName,
    holder_agency: v.holderAgency,
    khur_service_code: v.khurServiceCode,
    annual_volume: v.annualVolume,
  }));

export const registryOverviewResponse = (o: RegistryOverview) => ({
  total_services: o.totalServices,
  published_services: o.publishedServices,
  draft_services: o.draftServices,
  life_events: o.lifeEvents,
  evidences: o.evidences,
  evidences_in_khur: o.evidencesInKhur,
  once_only_violations: o.onceOnlyViolations,
  once_only_annual_hits: o.onceOnlyAnnualHits,
  by_proactivity: o.byProactivity,
  avg_max_days: o.avgMaxDays,
});

export const onceOnlyReportResponse = (r: OnceOnlyReport) => ({
  service_id: r.serviceId,
  service_code: r.serviceCode,
  service_name: r.serviceName,
  citizen_documents: r.citizenDocuments,
  violations: r.violations.map(evidenceLinkResponse),
  compliant: r.compliant,
  eligible_proactivity: r.eligibleProactivity,
});
