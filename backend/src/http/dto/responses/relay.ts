// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type {
  RelayAssignment,
  RelayEvent,
  RelayOverview,
  RelayPlatform,
  RelayRequest,
  RelayRequestDetail,
  RelayRoute,
} from '../../../domain/relay.js';

/** raw нь jsonb утгыг хариунд оруулна (хоосныг талбаргүй болгоно). */
const raw = (v: unknown): unknown => (v === null || v === undefined ? undefined : v);

// ── Platforms / routes ───────────────────────────────────────────────────

export interface RelayPlatformResponse {
  id: string;
  code: string;
  name: string;
  direction: string;
  endpoint_url: string;
  supervisor_contact: string;
  webhook_secret: string;
  enabled: boolean;
  created_at: string;
}

export const relayPlatformResponse = (p: RelayPlatform): RelayPlatformResponse => ({
  id: p.id,
  code: p.code,
  name: p.name,
  direction: p.direction,
  endpoint_url: p.endpointUrl,
  supervisor_contact: p.supervisorContact,
  webhook_secret: p.webhookSecret,
  enabled: p.enabled,
  created_at: p.createdAt.toISOString(),
});

export const relayPlatformListResponse = (list: RelayPlatform[]): RelayPlatformResponse[] =>
  list.map(relayPlatformResponse);

export interface RelayRouteResponse {
  id: string;
  service_code: string;
  platform_id: string;
  platform_name: string;
  sla_minutes: number;
  created_at: string;
}

export const relayRouteResponse = (rt: RelayRoute): RelayRouteResponse => ({
  id: rt.id,
  service_code: rt.serviceCode,
  platform_id: rt.platformId,
  platform_name: rt.platformName,
  sla_minutes: rt.slaMinutes,
  created_at: rt.createdAt.toISOString(),
});

export const relayRouteListResponse = (list: RelayRoute[]): RelayRouteResponse[] =>
  list.map(relayRouteResponse);

// ── Requests / assignments / events ──────────────────────────────────────

export interface RelayRequestResponse {
  id: string;
  source_platform: string;
  external_ref: string;
  service_code: string;
  title: string;
  payload?: unknown;
  priority: string;
  received_at: string;
  due_at: string;
  status: string;
  result?: unknown;
  fulfilled_at?: string;
  breach_notified: boolean;
}

export function relayRequestResponse(q: RelayRequest): RelayRequestResponse {
  return {
    id: q.id,
    source_platform: q.sourcePlatform,
    external_ref: q.externalRef,
    service_code: q.serviceCode,
    title: q.title,
    ...(raw(q.payload) !== undefined ? { payload: q.payload } : {}),
    priority: q.priority,
    received_at: q.receivedAt.toISOString(),
    due_at: q.dueAt.toISOString(),
    status: q.status,
    ...(raw(q.result) !== undefined ? { result: q.result } : {}),
    ...(q.fulfilledAt ? { fulfilled_at: q.fulfilledAt.toISOString() } : {}),
    breach_notified: q.breachNotified,
  };
}

export const relayRequestListResponse = (list: RelayRequest[]): RelayRequestResponse[] =>
  list.map(relayRequestResponse);

export interface RelayAssignmentResponse {
  id: string;
  request_id: string;
  platform_id: string;
  platform_name: string;
  status: string;
  due_at: string;
  dispatched_at?: string;
  responded_at?: string;
  result?: unknown;
  reminders_sent: number;
  escalated: boolean;
}

function relayAssignmentResponse(a: RelayAssignment): RelayAssignmentResponse {
  return {
    id: a.id,
    request_id: a.requestId,
    platform_id: a.platformId,
    platform_name: a.platformName,
    status: a.status,
    due_at: a.dueAt.toISOString(),
    ...(a.dispatchedAt ? { dispatched_at: a.dispatchedAt.toISOString() } : {}),
    ...(a.respondedAt ? { responded_at: a.respondedAt.toISOString() } : {}),
    ...(raw(a.result) !== undefined ? { result: a.result } : {}),
    reminders_sent: a.remindersSent,
    escalated: a.escalated,
  };
}

export interface RelayEventResponse {
  id: string;
  request_id: string;
  assignment_id?: string;
  type: string;
  detail: string;
  created_at: string;
}

function relayEventResponse(e: RelayEvent): RelayEventResponse {
  return {
    id: e.id,
    request_id: e.requestId,
    ...(e.assignmentId ? { assignment_id: e.assignmentId } : {}),
    type: e.type,
    detail: e.detail,
    created_at: e.createdAt.toISOString(),
  };
}

// ── Overview + detail ────────────────────────────────────────────────────

export interface RelayOverviewResponse {
  received_today: number;
  in_progress: number;
  overdue: number;
  fulfilled: number;
  total: number;
  sla_compliance_pct: number;
  avg_fulfill_mins: number;
  status_buckets: { status: string; count: number }[];
  platforms: {
    platform_id: string;
    platform_name: string;
    total: number;
    done: number;
    overdue: number;
    pending: number;
    compliance_pct: number;
  }[];
  recent_events: RelayEventResponse[];
}

export function relayOverviewResponse(o: RelayOverview): RelayOverviewResponse {
  return {
    received_today: o.receivedToday,
    in_progress: o.inProgress,
    overdue: o.overdue,
    fulfilled: o.fulfilled,
    total: o.total,
    sla_compliance_pct: o.slaCompliancePct,
    avg_fulfill_mins: o.avgFulfillMins,
    status_buckets: o.statusBuckets.map((b) => ({ status: b.status, count: b.count })),
    platforms: o.platforms.map((p) => ({
      platform_id: p.platformId,
      platform_name: p.platformName,
      total: p.total,
      done: p.done,
      overdue: p.overdue,
      pending: p.pending,
      compliance_pct: p.compliancePct,
    })),
    recent_events: o.recentEvents.map(relayEventResponse),
  };
}

export interface RelayRequestDetailResponse {
  request: RelayRequestResponse;
  assignments: RelayAssignmentResponse[];
  events: RelayEventResponse[];
}

export const relayRequestDetailResponse = (d: RelayRequestDetail): RelayRequestDetailResponse => ({
  request: relayRequestResponse(d.request),
  assignments: d.assignments.map(relayAssignmentResponse),
  events: d.events.map(relayEventResponse),
});
