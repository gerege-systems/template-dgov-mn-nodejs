// Иргэний "Төрийн үйлчилгээ" порталын BFF (/api/gov/*) хариунуудын TS хэлбэрүүд.
// Backend-ийн responses_gov.go-той тэнцүү (json tag-аар).

// Амьдралын үйл явдал (CPSV-AP cv:isGroupedBy). eu_code нь ЕХ-ны хяналттай
// толийн код (BIR/RES/MOV…), en_label нь түүний англи нэр.
export interface GovLifeEvent {
  code: string;
  name: string;
  kind: 'life' | 'business';
  eu_code: string;
  en_label: string;
}

// Каталогийн үйлчилгээ — CPSV-AP 3.2.0-д зэрэгцүүлсэн талбаруудтай.
export interface GovService {
  id: string;
  code: string;              // dct:identifier — MN-<COFOG>-<дугаар>
  name: string;
  category: string;
  agency: string;
  description: string;
  fee: number;
  processing_days: number;
  processing_time: string;   // ISO 8601 duration (P7D)
  cofog_code: string;        // НҮБ COFOG 1999
  cofog_label: string;
  sdg_code: string;          // SDG Annex II procedure код
  output_type: string;       // CPSV-AP Output толь
  evidence: string[];        // cpsv:hasInput
  legal_basis: string;
  assurance_level: 'low' | 'substantial' | 'high';
  fulfilment: 'auto' | 'manual';
  sla_hours: number;
  tacit_approval: boolean;
  life_events: GovLifeEvent[];
  online: boolean;
}

export type GovStatus =
  | 'submitted' | 'registered' | 'in_review' | 'info_required'
  | 'approved' | 'rejected' | 'completed' | 'cancelled' | 'expired';

export type GovResult =
  | '' | 'granted' | 'refused' | 'withdrawn' | 'not_admissible' | 'processed';

export interface GovApplication {
  id: string;
  service_code: string;
  service_name: string;
  reference_no: string;
  status: GovStatus;
  result: GovResult;
  note: string;
  decision_note: string;
  due_at: string | null;
  sla_breached: boolean;
  suspended: boolean;
  assigned: boolean;
  tacit: boolean;
  output_ref_id: string | null;
  submitted_at: string;
  updated_at: string | null;
}

// Хүсэлт гаргасны хариу. auto_issued=true бол үйлчилгээ ШУУД биелсэн.
export interface GovApplyResult {
  application: GovApplication;
  reference: GovReference | null;
  auto_issued: boolean;
}

// Хүсэлтийн явцын нэг бичлэг.
export interface GovApplicationEvent {
  id: string;
  actor_role: string;
  from_status: string;
  to_status: string;
  type: string;
  detail: string;
  created_at: string;
}

// ── Менежерийн дараалал ──────────────────────────────────────────────────────

export interface GovQueueStats {
  open: number;
  unassigned: number;
  mine: number;
  overdue: number;
  due_soon: number;
}

export interface GovQueueItem extends GovApplication {
  user_id: string;
  assigned_to: string | null;
  assigned_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  payload: unknown;
}

export interface GovQueueDetail {
  application: GovQueueItem;
  service: GovService | null;
  events: GovApplicationEvent[];
}

export interface GovReference {
  id: string;
  type: string;
  title: string;
  reference_no: string;
  status: string;
  issued_at: string;
  valid_until: string | null;
  data: unknown;
}

export interface GovNotification {
  id: string;
  title: string;
  body: string;
  category: 'info' | 'success' | 'warning';
  read: boolean;
  created_at: string;
}

export interface GovPayment {
  id: string;
  title: string;
  category: 'tax' | 'fee' | 'fine';
  amount: number;
  currency: string;
  status: 'pending' | 'paid';
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface GovAppointment {
  id: string;
  service_name: string;
  agency: string;
  location: string;
  scheduled_at: string;
  status: 'booked' | 'confirmed' | 'cancelled' | 'completed';
  note: string;
}

export interface GovOverview {
  open_applications: number;
  unread_notifications: number;
  unpaid_count: number;
  unpaid_amount: number;
  upcoming_count: number;
  issued_references: number;
  recent_applications: GovApplication[];
  upcoming_appointments: GovAppointment[];
}
