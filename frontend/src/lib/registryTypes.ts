// Government Template Platform V3.0
// Ring System · R1 — Үйлчилгээний нэгдсэн регистрийн frontend типүүд
// (backend responses_registry.go-ийн snake_case DTO-той тохирно).

/** Паспортын статус. */
export type RegistryStatus = 'draft' | 'published' | 'archived';

/** Проактив байдлын шат (Эстони загвар). */
export type Proactivity = 'information' | 'online' | 'once_only' | 'proactive';

/** CPSV-AP-ийн Channel — Монголын нөхцөлд буулгасан. */
export const CHANNELS = ['office', 'e-mongolia', 'mobile', 'phone', 'post'] as const;

export const PROACTIVITY_LEVELS: Proactivity[] = [
  'information',
  'online',
  'once_only',
  'proactive',
];

export interface RegistryEvidenceLink {
  evidence_id: string;
  code: string;
  name: string;
  required: boolean;
  /** Уг баримтыг иргэнээс шаардаж байгаа эсэх. */
  from_citizen: boolean;
  /** Мэдээлэл ХУР-д аль хэдийн байгаа эсэх. */
  in_khur: boolean;
  /** from_citizen && in_khur — backend талд тооцоологдсон. */
  once_only_violation: boolean;
  note: string;
}

export interface RegistryService {
  id: string;
  code: string;
  name: string;
  name_en: string;
  description: string;
  authority: string;
  authority_org_id?: string | null;
  legal_basis: string;
  target_group: string;
  output: string;
  channels: string[];
  fee: number;
  max_days: number;
  steps_count: number;
  annual_volume: number;
  proactivity: Proactivity;
  status: RegistryStatus;
  life_event_id?: string | null;

  /**
   * Үйл ажиллагааны тохиргоо (migration 47) — паспорт нийтлэгдэхэд иргэний
   * порталын ажлын каталог (gov_services) руу БУУДАГ хэсэг. Регистр нь
   * үйлчилгээний цорын ганц эх сурвалж тул эдгээрийг ЭНД засна.
   */
  category: string;
  cofog_code: string;
  cofog_label: string;
  main_activity: string;
  sdg_code: string;
  processing_time: string;
  output_type: OutputType;
  output_ref_type: string;
  assurance_level: AssuranceLevel;
  /** auto = бүртгэлээс шууд олгоно; manual = менежер хянана. */
  fulfilment: Fulfilment;
  has_discretion: boolean;
  has_assessment: boolean;
  sla_hours: number;
  tacit_approval: boolean;
  online: boolean;

  version: number;
  published_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  /** Зөвхөн дэлгэрэнгүй уншилтад ирнэ. */
  evidences?: RegistryEvidenceLink[];
}

/** Паспорт үүсгэх/засах body (backend requests_registry.go-той тохирно). */
export interface RegistryServiceInput {
  code?: string;
  name: string;
  name_en?: string;
  description?: string;
  authority: string;
  legal_basis?: string;
  target_group?: string;
  output?: string;
  channels?: string[];
  fee?: number;
  max_days?: number;
  steps_count?: number;
  annual_volume?: number;
  proactivity?: Proactivity;
  life_event_id?: string | null;

  category?: string;
  cofog_code?: string;
  cofog_label?: string;
  main_activity?: string;
  sdg_code?: string;
  processing_time?: string;
  output_type?: OutputType;
  output_ref_type?: string;
  assurance_level?: AssuranceLevel;
  fulfilment?: Fulfilment;
  has_discretion?: boolean;
  has_assessment?: boolean;
  sla_hours?: number;
  tacit_approval?: boolean;
  online?: boolean;
}

/** Биелүүлэх горим — иргэн юу хүлээхийг тодорхойлдог гол ялгаа. */
export type Fulfilment = 'auto' | 'manual';

/** eIDAS (Reg. 910/2014 Art.8) баталгаажилтын түвшин. */
export type AssuranceLevel = 'low' | 'substantial' | 'high';

/** CPSV-AP-ийн Output толь (cpsv:produces). */
export type OutputType =
  | 'Declaration' | 'Physical object' | 'Code'
  | 'Financial obligation' | 'Financial benefit' | 'Recognition' | 'Permit';

export const OUTPUT_TYPES: OutputType[] = [
  'Declaration', 'Physical object', 'Code',
  'Financial obligation', 'Financial benefit', 'Recognition', 'Permit',
];

export interface RegistryVersion {
  id: string;
  service_id: string;
  version: number;
  change_note: string;
  is_baseline: boolean;
  steps_count: number;
  documents_count: number;
  max_days: number;
  fee: number;
  /** Baseline-тай харьцуулсан ялгаа — СӨРӨГ утга нь сайжралт. */
  delta_steps: number;
  delta_documents: number;
  delta_days: number;
  delta_fee: number;
  published_at: string;
}

export interface RegistryEvidence {
  id: string;
  code: string;
  name: string;
  description: string;
  holder_agency: string;
  source_system: string;
  in_khur: boolean;
  khur_service_code: string;
  created_at: string;
  updated_at?: string | null;
}

export interface RegistryLifeEvent {
  id: string;
  code: string;
  name: string;
  kind: 'life' | 'business';
  description: string;
  lead_agency: string;
  sort_order: number;
  created_at: string;
}

export interface RegistryOnceOnlyViolation {
  service_id: string;
  service_code: string;
  service_name: string;
  authority: string;
  service_status: RegistryStatus;
  evidence_id: string;
  evidence_code: string;
  evidence_name: string;
  holder_agency: string;
  /** Иргэний цаасыг орлох ХУР лавлагааны код — засварын шууд заавар. */
  khur_service_code: string;
  annual_volume: number;
}

export interface RegistryOnceOnlyReport {
  service_id: string;
  service_code: string;
  service_name: string;
  citizen_documents: number;
  violations: RegistryEvidenceLink[];
  compliant: boolean;
  /** Одоогийн байдалд зарлаж болох дээд шат. */
  eligible_proactivity: Proactivity;
}

export interface RegistryOverview {
  total_services: number;
  published_services: number;
  draft_services: number;
  life_events: number;
  evidences: number;
  evidences_in_khur: number;
  once_only_violations: number;
  /** Зөрчлүүдийн жилийн нийт давтамж — иргэдэд учирч буй дарамтын хэмжээс. */
  once_only_annual_hits: number;
  by_proactivity: Record<string, number>;
  avg_max_days: number;
}
