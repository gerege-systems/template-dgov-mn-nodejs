// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Иргэний "Төрийн үйлчилгээ" порталын домэйн entity-үүд. gov_services нь
// НИЙТИЙН каталог; бусад нь хэрэглэгч-тус-бүрийн (userId-гаар scope хийгдэнэ).

/**
 * Үйлчилгээний биелүүлэх горим.
 *
 * • auto   — бүртгэлээс шууд уншиж олгодог (лавлагаа, тодорхойлолт). Хүн
 *   оролцохгүй: хүсэлт өгмөгц НЭГ транзакцид биелнэ.
 * • manual — менежер (officer) хянаж шийдвэрлэсний дараа биелнэ.
 */
export const GovFulfilmentAuto = 'auto';
export const GovFulfilmentManual = 'manual';

/** Хүсэлтийн төлөвүүд (migration 44-ийн CHECK-тэй таарна). */
export const GovStatusSubmitted = 'submitted';
export const GovStatusRegistered = 'registered';
export const GovStatusInReview = 'in_review';
export const GovStatusInfoRequired = 'info_required';
export const GovStatusApproved = 'approved';
export const GovStatusRejected = 'rejected';
export const GovStatusCompleted = 'completed';
export const GovStatusCancelled = 'cancelled';
export const GovStatusExpired = 'expired';

/**
 * Үр дүнгийн толь. Голландын ZGW-ийн сургамж: ЯВЦЫН толийг (status) байгууллага
 * өөрөө тодорхойлдог ч ҮР ДҮНГИЙН толийг улсын хэмжээнд нэгтгэдэг — тайлан,
 * статистик үүн дээр тогтдог.
 */
export const GovResultGranted = 'granted';
export const GovResultRefused = 'refused';
export const GovResultWithdrawn = 'withdrawn';
export const GovResultNotAdmissible = 'not_admissible';
export const GovResultProcessed = 'processed';

/**
 * govTransitions нь зөвшөөрөгдсөн шилжилтүүд — ГАНЦ эх сурвалж. Repository-ийн
 * SQL нь эдгээрийг `WHERE status IN (...)` болгон ДАВХАР хэрэгжүүлж, зэрэг
 * ирсэн хоёр шийдвэрийн уралдааныг (race) хаана.
 *
 * Шийдвэрлэх төлвүүдээс `approved` болон `completed` ХОЁУЛАА зөвшөөрөгдөнө:
 *   → completed : гаралт тэр дороо олгогдоно (лавлагаа) — завсрын төлөв утгагүй.
 *   → approved  : гаралт нь БИЕТ зүйл (үнэмлэх) — шийдвэр гарсан ч хэвлэгдэх
 *                 хүртэл дуусаагүй. Дараа нь completed болно.
 */
const govTransitions: Record<string, string[]> = {
  [GovStatusSubmitted]: [GovStatusRegistered, GovStatusCancelled],
  [GovStatusRegistered]: [
    GovStatusInReview,
    GovStatusInfoRequired,
    GovStatusApproved,
    GovStatusCompleted,
    GovStatusRejected,
    GovStatusCancelled,
    GovStatusExpired,
  ],
  [GovStatusInReview]: [
    GovStatusInfoRequired,
    GovStatusApproved,
    GovStatusCompleted,
    GovStatusRejected,
    GovStatusCancelled,
    GovStatusExpired,
  ],
  [GovStatusInfoRequired]: [
    GovStatusInReview,
    GovStatusApproved,
    GovStatusCompleted,
    GovStatusRejected,
    GovStatusCancelled,
    GovStatusExpired,
  ],
  [GovStatusApproved]: [GovStatusCompleted],
  // Терминал төлөвүүд — цаашид шилжихгүй.
  [GovStatusRejected]: [],
  [GovStatusCompleted]: [],
  [GovStatusCancelled]: [],
  [GovStatusExpired]: [],
};

/** govCanTransition нь from → to шилжилт зөвшөөрөгдсөн эсэхийг хэлнэ. */
export function govCanTransition(from: string, to: string): boolean {
  return (govTransitions[from] ?? []).includes(to);
}

/** govAllowedTransitions нь тухайн төлвөөс шилжиж болох төлвүүдийг буцаана. */
export const govAllowedTransitions = (from: string): string[] => govTransitions[from] ?? [];

/**
 * govIsOpen нь хүсэлт ХАРААХАН шийдэгдээгүй (менежерийн дараалалд байгаа)
 * эсэхийг хэлнэ. Overview-ийн тоолол болон SLA sweep үүнийг ашиглана.
 */
export function govIsOpen(status: string): boolean {
  return (
    status === GovStatusSubmitted ||
    status === GovStatusRegistered ||
    status === GovStatusInReview ||
    status === GovStatusInfoRequired
  );
}

/** GovLifeEvent нь CPSV-AP-ийн Event (Life/Business). */
export interface GovLifeEvent {
  code: string;
  name: string;
  /** life | business */
  kind: string;
  euCode: string;
  enLabel: string;
}

/**
 * GovService нь каталогийн нэг үйлчилгээ. Талбарууд нь CPSV-AP 3.2.0 (SEMIC)-ийн
 * Public Service класстай зэрэгцүүлэгдсэн.
 */
export interface GovService {
  id: string;
  /** code нь dct:identifier — MN-<COFOG>-<дугаар>. */
  code: string;
  name: string;
  category: string;
  /** agency нь cv:hasCompetentAuthority. */
  agency: string;
  description: string;
  /** fee нь cv:hasCost (төгрөг). */
  fee: number;
  processingDays: number;
  /** processingTime нь cv:processingTime — ISO 8601 duration. */
  processingTime: string;
  cofogCode: string;
  cofogLabel: string;
  mainActivity: string;
  sdgCode: string;
  /** outputType нь cpsv:produces. */
  outputType: string;
  outputRefType: string;
  /** evidence нь cpsv:hasInput. */
  evidence: string[];
  legalBasis: string;
  assuranceLevel: string;
  /** lifecycle нь adms:status. */
  lifecycle: string;
  /** fulfilment нь auto | manual. */
  fulfilment: string;
  hasDiscretion: boolean;
  hasAssessment: boolean;
  /** slaHours нь үйлчилгээний норм (ZGW `servicenorm`). */
  slaHours: number;
  tacitApproval: boolean;
  lifeEvents: GovLifeEvent[];
  online: boolean;
  enabled: boolean;
  createdAt: Date;
}

/** GovApplication нь иргэний үйлчилгээний хүсэлт. */
export interface GovApplication {
  id: string;
  userId: string;
  serviceId: string | null;
  serviceCode: string;
  serviceName: string;
  referenceNo: string;
  status: string;
  result: string;
  note: string;
  /** payload нь маягтын өгөгдөл (jsonb). */
  payload: Record<string, unknown> | null;
  assignedTo: string | null;
  assignedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string;
  dueAt: Date | null;
  slaBreached: boolean;
  /** suspendedAt нь цаг зогссон мөч (ZGW `Opschorting`). */
  suspendedAt: Date | null;
  outputRefId: string | null;
  tacit: boolean;
  submittedAt: Date;
  updatedAt: Date | null;
}

/** GovApplicationEvent нь хүсэлтийн timeline-ийн нэг бичлэг (append-only). */
export interface GovApplicationEvent {
  id: string;
  applicationId: string;
  actorId: string | null;
  actorRole: string;
  fromStatus: string;
  toStatus: string;
  type: string;
  detail: string;
  createdAt: Date;
}

/** GovReference нь олгогдсон лавлагаа/тодорхойлолт. */
export interface GovReference {
  id: string;
  userId: string;
  type: string;
  title: string;
  referenceNo: string;
  status: string;
  issuedAt: Date;
  validUntil: Date | null;
  data: Record<string, unknown> | null;
}

/** GovNotification нь иргэнд илгээсэн мэдэгдэл. */
export interface GovNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  createdAt: Date;
}

/** GovPayment нь төлбөр (татвар/хураамж/торгууль). */
export interface GovPayment {
  id: string;
  userId: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  createdAt: Date;
}

/** GovAppointment нь төрийн байгууллага дахь цаг захиалга. */
export interface GovAppointment {
  id: string;
  userId: string;
  serviceId: string | null;
  serviceName: string;
  agency: string;
  location: string;
  scheduledAt: Date;
  status: string;
  note: string;
  createdAt: Date;
}

/** GovOverview нь иргэний нүүр хуудасны нэгтгэл. */
export interface GovOverview {
  openApplications: number;
  unreadNotifications: number;
  unpaidCount: number;
  unpaidAmount: number;
  upcomingCount: number;
  issuedReferences: number;
  recentApplications: GovApplication[];
  upcomingAppointments: GovAppointment[];
}

/**
 * GovQueueStats нь МЕНЕЖЕРИЙН дарааллын нэгтгэл — иргэний Overview-ээс ТУСДАА
 * (өөр эрх, өөр хамрах хүрээ).
 */
export interface GovQueueStats {
  open: number;
  unassigned: number;
  mine: number;
  overdue: number;
  dueSoon: number;
}

/** GovQueueFilter нь менежерийн дарааллын шүүлтүүр. */
export interface GovQueueFilter {
  /** status хоосон бол бүх НЭЭЛТТЭЙ төлөв. */
  status: string;
  /** assignedTo — "me" гэсэн утгыг usecase нь userId болгож хөрвүүлнэ. */
  assignedTo: string;
  overdue: boolean;
  limit: number;
  offset: number;
}
