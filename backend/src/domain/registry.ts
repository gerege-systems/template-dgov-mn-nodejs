// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Ring System · R1 — Үйлчилгээний нэгдсэн регистрийн домэйн entity-үүд.
//
// Эдгээр нь БАЙГУУЛЛАГЫН мастер өгөгдөл (хэрэглэгч-тус-бүрийн БИШ) тул RLS-гүй;
// хамгаалалт нь `registry.view` / `registry.manage` эрхээр HTTP давхаргад.

/** Паспортын статус. */
export const RegistryStatusDraft = 'draft';
export const RegistryStatusPublished = 'published';
export const RegistryStatusArchived = 'archived';

/**
 * Проактив байдлын шат (Эстони загвар) — мэдээллээс автомат үйлчилгээ хүртэл.
 *
 * • information — зөвхөн мэдээлэл нийтэлсэн
 * • online      — онлайн өргөдөл авдаг
 * • once_only   — байгаа өгөгдлийг ДАХИН шаарддаггүй
 * • proactive   — иргэн хүсэлт гаргалгүй өөрөө санал болгодог
 */
export const ProactivityInformation = 'information';
export const ProactivityOnline = 'online';
export const ProactivityOnceOnly = 'once_only';
export const ProactivityProactive = 'proactive';

/** ProactivityLevels нь зөвшөөрөгдсөн шатууд (шалгалтад). */
export const ProactivityLevels = new Set([
  ProactivityInformation,
  ProactivityOnline,
  ProactivityOnceOnly,
  ProactivityProactive,
]);

/**
 * RegistryLifeEvent нь амьдралын/бизнесийн үйл явдал (төрөлт, гэрлэлт, бизнес
 * эхлүүлэх…) — үйлчилгээнүүдийг журнейгээр багцалдаг давхарга.
 */
export interface RegistryLifeEvent {
  id: string;
  code: string;
  name: string;
  /** life | business */
  kind: string;
  description: string;
  leadAgency: string;
  /**
   * euCode нь ЕХ-ны хяналттай толийн код: life → ox8/life-event/LE (BIR, RES,
   * MOV…), business → m58/business-event/BE (STBU…). Хоосон бол зөвхөн
   * үндэсний ойлголт.
   */
  euCode: string;
  enLabel: string;
  sortOrder: number;
  createdAt: Date;
}

/**
 * RegistryEvidence нь нотолгооны каталогийн нэг бичиг баримт. inKhur нь уг
 * мэдээлэл ХУР-д АЛЬ ХЭДИЙН байгаа эсэхийг заана — once-only шалгалтын үндэс.
 */
export interface RegistryEvidence {
  id: string;
  code: string;
  name: string;
  description: string;
  holderAgency: string;
  sourceSystem: string;
  inKhur: boolean;
  khurServiceCode: string;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * RegistryServiceEvidence нь паспорт ↔ нотолгооны холбоос. fromCitizen нь уг
 * баримтыг ИРГЭНЭЭС шаардаж байгаа эсэх (эсрэг тохиолдолд байгууллага өөрөө
 * системээс татдаг).
 */
export interface RegistryServiceEvidence {
  evidenceId: string;
  code: string;
  name: string;
  required: boolean;
  fromCitizen: boolean;
  /** inKhur нь ХУР-д байгаа эсэх (evidence-ээс уншигдана). */
  inKhur: boolean;
  note: string;
}

/** RegistryService нь CPSV-AP-д нийцсэн үйлчилгээний паспорт. */
export interface RegistryService {
  id: string;
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
  /** fee нь төгрөгөөр. */
  fee: number;
  /** maxDays нь ХУУЛИЙН шийдвэрлэх дээд хугацаа. */
  maxDays: number;
  stepsCount: number;
  annualVolume: number;
  proactivity: string;
  status: string;
  lifeEventId: string | null;

  // ── Үйл ажиллагааны тохиргоо ──────────────────────────────────────────
  // Эдгээр нь паспорт нийтлэгдэхэд ажлын каталог (gov_services) руу БУУДАГ
  // талбарууд. Регистр нь МАСТЕР тул тэдгээрийг энд засна.
  category: string;
  /** cofogCode нь НҮБ COFOG 1999. */
  cofogCode: string;
  cofogLabel: string;
  /** mainActivity нь dct:type — ЕХ main-activity authority table. */
  mainActivity: string;
  /** sdgCode нь SDG Annex II procedure код. */
  sdgCode: string;
  /** processingTime нь cv:processingTime — ISO 8601 duration. */
  processingTime: string;
  /** outputType нь cpsv:produces — CPSV-AP Output толь. */
  outputType: string;
  /** outputRefType нь гаралт лавлагаа бол gov_references.type. */
  outputRefType: string;
  /** assuranceLevel нь eIDAS: low/substantial/high. */
  assuranceLevel: string;
  /**
   * fulfilment нь `auto` бол иргэн хүсэлт гаргамагц бүртгэлээс шууд олгогдоно;
   * `manual` бол менежерийн дараалалд орно.
   */
  fulfilment: string;
  /** hasDiscretion нь үнэлэх эрх (Ermessen). */
  hasDiscretion: boolean;
  /** hasAssessment нь үнэлгээний зай (Beurteilungsspielraum). */
  hasAssessment: boolean;
  /** slaHours нь БАЙГУУЛЛАГЫН норм (maxDays нь хуулийн дээд хугацаа). */
  slaHours: number;
  tacitApproval: boolean;
  online: boolean;

  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;

  /** evidences нь ЗӨВХӨН дэлгэрэнгүй уншилтад дүүргэгдэнэ (жагсаалтад хоосон). */
  evidences: RegistryServiceEvidence[];
}

/**
 * RegistryServiceVersion нь нийтлэгдсэн паспортын хувилбар. delta* талбарууд нь
 * baseline (дахин инженерчлэлийн ӨМНӨХ төлөв)-тэй харьцуулсан ялгаа — СӨРӨГ
 * утга нь сайжралт.
 */
export interface RegistryServiceVersion {
  id: string;
  serviceId: string;
  version: number;
  snapshot: Record<string, unknown> | null;
  changeNote: string;
  isBaseline: boolean;
  stepsCount: number;
  documentsCount: number;
  maxDays: number;
  fee: number;
  deltaSteps: number;
  deltaDocuments: number;
  deltaDays: number;
  deltaFee: number;
  publishedAt: Date;
  publishedBy: string | null;
}

/**
 * RegistryOnceOnlyViolation нь ХУР-д БАЙГАА мэдээллийг иргэнээс ДАХИН шаардаж
 * буй нэг тохиолдол.
 */
export interface RegistryOnceOnlyViolation {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  authority: string;
  serviceStatus: string;
  evidenceId: string;
  evidenceCode: string;
  evidenceName: string;
  holderAgency: string;
  khurServiceCode: string;
  annualVolume: number;
}

/**
 * RegistryOverview нь регистрийн удирдлагын нэгтгэл — "төрийн үйлчилгээний
 * инвентар хэр бүрэн, хэр дижитал, once-only-д хэр ойрхон вэ".
 */
export interface RegistryOverview {
  totalServices: number;
  publishedServices: number;
  draftServices: number;
  lifeEvents: number;
  evidences: number;
  evidencesInKhur: number;
  /**
   * onceOnlyViolations нь зөрчлийн тоо; onceOnlyAnnualHits нь тэдгээрийн жилийн
   * нийт давтамж (иргэдэд учирч буй дарамтын хэмжээст ойролцоолол).
   */
  onceOnlyViolations: number;
  onceOnlyAnnualHits: number;
  /** byProactivity нь шат бүрээр үйлчилгээний тоо. */
  byProactivity: Record<string, number>;
  /** avgMaxDays нь дундаж хуулийн шийдвэрлэх хугацаа (нийтлэгдсэнээр). */
  avgMaxDays: number;
}

/**
 * eligibleProactivity нь зөрчлийн байдалд хүрч БОЛОХ дээд шатыг тодорхойлно.
 * Зөрчилтэй бол `online`-аас дээш гарах боломжгүй — ХУР-д байгаа мэдээллийг
 * иргэнээс дахин шаардаж байхад "once-only" гэж нэрлэх нь худал болно.
 */
export function eligibleProactivity(current: string, hasViolations: boolean): string {
  if (!hasViolations) return current;
  return current === ProactivityOnceOnly || current === ProactivityProactive
    ? ProactivityOnline
    : current;
}
