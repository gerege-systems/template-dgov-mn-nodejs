// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Platform-хоорондын үйлчилгээний хүсэлт дамжуулах + SLA хяналтын домэйн. Дээд
// platform-оос хугацаатай хүсэлт хүлээж авч, доод platform-ууд руу дамжуулж,
// заагдсан хугацаанд биелэлтийг хянаж/шахаж, хариуг цуглуулна. Эдгээр нь
// platform-хоорондын тохиргоо/telemetry (per-citizen биш) тул gateway-ийн адил
// RLS-гүй.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ── RelayRequest-ийн статусууд ────────────────────────────────────────────
export const RelayReqReceived = 'received';
export const RelayReqDispatched = 'dispatched';
export const RelayReqInProgress = 'in_progress';
export const RelayReqFulfilled = 'fulfilled';
export const RelayReqOverdue = 'overdue';
export const RelayReqRejected = 'rejected';

// ── RelayAssignment-ийн статусууд ─────────────────────────────────────────
export const RelayAsgPending = 'pending';
export const RelayAsgAcknowledged = 'acknowledged';
export const RelayAsgInProgress = 'in_progress';
export const RelayAsgDone = 'done';
export const RelayAsgOverdue = 'overdue';
export const RelayAsgRejected = 'rejected';

// ── relay_events-ийн төрлүүд (timeline + realtime feed) ───────────────────
export const RelayEvtReceived = 'received';
export const RelayEvtDispatched = 'dispatched';
export const RelayEvtReminded = 'reminded';
export const RelayEvtEscalated = 'escalated';
export const RelayEvtResponded = 'responded';
export const RelayEvtFulfilled = 'fulfilled';
export const RelayEvtOverdue = 'overdue';
export const RelayEvtBreachNotified = 'breach_notified';
/** RelayEvtForwardedUp — дээд platform руу webhook-оор дамжуулав. */
export const RelayEvtForwardedUp = 'forwarded_up';

/**
 * Platform-ын чиглэл: upstream (дээрээс хүсэлт ирж, бид түүнд хариу/дамжуулна)
 * эсвэл downstream (бид доош хүсэлт дамжуулж, хариуг нь хүлээнэ).
 */
export const RelayDirUpstream = 'upstream';
export const RelayDirDownstream = 'downstream';

/**
 * RelayReminderFractions нь SLA цонхны аль хувь дээр downstream-д сануулга
 * (шахалт) илгээхийг заана.
 */
export const RelayReminderFractions: readonly number[] = [0.75, 0.9];

/**
 * RelayEscalateGraceMs нь assignment overdue болсноос хойш дээд шат руу
 * (supervisor) автоматаар escalate хийхийн өмнөх нэмэлт хугацаа. Template
 * default (production-д SLA-даа тааруулж уртасгаж болно).
 */
export const RelayEscalateGraceMs = 2 * 60 * 1000;

/**
 * RelayPlatform нь дамжуулагч peer platform-ын бүртгэл — direction-оор upstream
 * (дээд) эсвэл downstream (доод) болохыг заана.
 */
export interface RelayPlatform {
  id: string;
  code: string;
  name: string;
  /** direction: upstream | downstream */
  direction: string;
  /** endpointUrl нь webhook push хийх хаяг (demo-д дотоод loopback). */
  endpointUrl: string;
  /** supervisorContact нь escalate хийх дээд шатны хаяг. */
  supervisorContact: string;
  /** webhookSecret нь ирсэн/явах webhook-ийн HMAC гарын үсгийн нууц. */
  webhookSecret: string;
  enabled: boolean;
  createdAt: Date;
}

/** RelayRoute нь service_code → platform чиглүүлэлтийн дүрэм (target бүрийн SLA-тай). */
export interface RelayRoute {
  id: string;
  serviceCode: string;
  platformId: string;
  /** platformName нь join-оор дүүрнэ. */
  platformName: string;
  slaMinutes: number;
  createdAt: Date;
}

/** RelayRequest нь дээд platform-оос ирсэн хугацаатай (dueAt) хүсэлт. */
export interface RelayRequest {
  id: string;
  sourcePlatform: string;
  externalRef: string;
  serviceCode: string;
  title: string;
  /** payload нь jsonb. */
  payload: unknown;
  priority: string;
  receivedAt: Date;
  dueAt: Date;
  status: string;
  /** result нь jsonb (нэгтгэсэн хариу). */
  result: unknown;
  fulfilledAt: Date | null;
  breachNotified: boolean;
  updatedAt: Date | null;
}

/** RelayAssignment нь нэг downstream platform-д оногдсон дэд даалгавар. */
export interface RelayAssignment {
  id: string;
  requestId: string;
  platformId: string;
  /** platformName нь join-оор дүүрнэ. */
  platformName: string;
  status: string;
  dueAt: Date;
  dispatchedAt: Date | null;
  respondedAt: Date | null;
  result: unknown;
  remindersSent: number;
  escalated: boolean;
}

/** RelayEvent нь хүсэлтийн timeline/feed-ийн нэг бичлэг. */
export interface RelayEvent {
  id: string;
  requestId: string;
  assignmentId: string | null;
  type: string;
  detail: string;
  createdAt: Date;
}

export interface RelayStatusBucket {
  status: string;
  count: number;
}

/** RelayPlatformStat нь downstream platform тус бүрийн SLA гүйцэтгэл. */
export interface RelayPlatformStat {
  platformId: string;
  platformName: string;
  total: number;
  done: number;
  overdue: number;
  pending: number;
  compliancePct: number;
}

/** RelayOverview нь realtime dashboard-ийн нэгтгэл. */
export interface RelayOverview {
  receivedToday: number;
  inProgress: number;
  overdue: number;
  fulfilled: number;
  total: number;
  /** slaCompliancePct нь dueAt дотор биелсэн хүсэлтийн хувь. */
  slaCompliancePct: number;
  avgFulfillMins: number;
  statusBuckets: RelayStatusBucket[];
  platforms: RelayPlatformStat[];
  recentEvents: RelayEvent[];
}

/** RelayRequestDetail нь нэг хүсэлт + assignment-ууд + event timeline. */
export interface RelayRequestDetail {
  request: RelayRequest;
  assignments: RelayAssignment[];
  events: RelayEvent[];
}

/**
 * relayRemindersDue нь эхэлсэн болон due хугацааг өгвөл одоо (now) хэдэн
 * сануулга илгээгдсэн байх ёстойг (RelayReminderFractions босгууд дээр
 * тулгуурлан) буцаана. remindersSent < энэ тоо бол шинэ сануулга шаардлагатай.
 */
export function relayRemindersDue(start: Date, dueAt: Date, now: Date): number {
  const total = dueAt.getTime() - start.getTime();
  if (total <= 0) return 0;
  const frac = (now.getTime() - start.getTime()) / total;
  let n = 0;
  for (const f of RelayReminderFractions) {
    if (frac >= f) n++;
  }
  return n;
}

// ── Webhook (peer platform хоорондын m2m баталгаажуулалт) ─────────────────

/**
 * Webhook гарын үсгийн header-ууд — peer platform-ууд хоорондоо HMAC-SHA256-оор
 * хүсэлтийг баталгаажуулна (JWT-гүй, m2m).
 */
export const RelayWebhookSourceHeader = 'X-Relay-Source';
export const RelayWebhookSigHeader = 'X-Relay-Signature';
export const RelayWebhookEventHeader = 'X-Relay-Event';
export const RelayWebhookSigPrefix = 'sha256=';

/**
 * RelayWebhookEnvelope нь peer платформ хооронд дамжуулах webhook-ийн бие.
 * Дээшээ/доошоо хүсэлт болон хариу дамжуулахад хоёуланд нь ашиглана.
 */
export interface RelayWebhookEnvelope {
  /** event: received|forward|fulfilled|breach|… */
  event: string;
  /** source_code нь илгээгч платформын code. */
  source_code: string;
  service_code?: string;
  external_ref?: string;
  title?: string;
  priority?: string;
  payload?: unknown;
  result?: unknown;
  due_at?: string;
  sent_at: string;
}

/**
 * relaySignWebhook нь body-г нууц түлхүүрээр HMAC-SHA256 гарын үсэг зурж
 * "sha256=<hex>" хэлбэрээр буцаана.
 */
export function relaySignWebhook(secret: string, body: Buffer): string {
  return RelayWebhookSigPrefix + createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * relayVerifyWebhook нь ирсэн гарын үсгийг ТОГТМОЛ ХУГАЦААНД (constant-time)
 * шалгана. Хоосон нууц/гарын үсэг бол false (fail-closed).
 */
export function relayVerifyWebhook(secret: string, signature: string, body: Buffer): boolean {
  if (secret === '' || signature === '') return false;
  const expected = Buffer.from(relaySignWebhook(secret, body), 'utf8');
  const got = Buffer.from(signature.trim(), 'utf8');
  // timingSafeEqual нь урт зөрвөл шиднэ — уртын зөрүү өөрөө нууц биш.
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/** relayNewWebhookSecret нь шинэ platform-д санамсаргүй 64-hex webhook нууц үүсгэнэ. */
export function relayNewWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * relayIsDemoEndpoint нь endpoint нь бодит HTTP биш (хоосон эсвэл demo://)
 * эсэхийг шалгана — тийм бол webhook-ийг гадагш илгээхгүй (demo simulator
 * дотооддоо ажиллана).
 */
export function relayIsDemoEndpoint(endpoint: string): boolean {
  const e = endpoint.trim();
  return e === '' || e.startsWith('demo://');
}
