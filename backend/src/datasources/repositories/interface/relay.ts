// Government Template Platform V3.0
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
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/** NewRelayPlatform нь peer platform бүртгэх оролт. */
export interface NewRelayPlatform {
  code: string;
  name: string;
  direction: string;
  endpointUrl: string;
  supervisorContact: string;
  webhookSecret: string;
  enabled: boolean;
}

/** NewRelayRoute нь чиглүүлэлтийн дүрэм. */
export interface NewRelayRoute {
  serviceCode: string;
  platformId: string;
  slaMinutes: number;
}

/** NewRelayRequest нь ingest хийгдэх хүсэлт (assignment-ууд тусад нь). */
export interface NewRelayRequest {
  sourcePlatform: string;
  externalRef: string;
  serviceCode: string;
  title: string;
  payload: unknown;
  priority: string;
  dueAt: Date;
  status: string;
}

/** NewRelayAssignment нь нэг downstream platform-д оногдох дэд даалгавар. */
export interface NewRelayAssignment {
  platformId: string;
  platformName: string;
  dueAt: Date;
}

/** NewRelayEvent нь timeline-д нэмэгдэх бичлэг. */
export interface NewRelayEvent {
  requestId: string;
  assignmentId: string | null;
  type: string;
  detail: string;
}

/**
 * RelayRepository нь platform-хоорондын хүсэлт дамжуулах + SLA хяналтын gateway.
 * gateway_postgres-ийн адил RLS-гүй (platform-хоорондын тохиргоо/telemetry).
 */
export interface RelayRepository {
  // ── Platforms (upstream/downstream peer registry) ────────────────────
  listPlatforms(ctx: Ctx): Promise<RelayPlatform[]>;
  getPlatformByCode(ctx: Ctx, code: string): Promise<RelayPlatform>;
  createPlatform(ctx: Ctx, input: NewRelayPlatform): Promise<RelayPlatform>;
  deletePlatform(ctx: Ctx, id: string): Promise<void>;

  // ── Routes (service_code → platform) ─────────────────────────────────
  listRoutes(ctx: Ctx): Promise<RelayRoute[]>;
  routesForService(ctx: Ctx, serviceCode: string): Promise<RelayRoute[]>;
  createRoute(ctx: Ctx, input: NewRelayRoute): Promise<RelayRoute>;
  deleteRoute(ctx: Ctx, id: string): Promise<void>;

  // ── Requests + assignments ───────────────────────────────────────────
  /**
   * createRequestWithAssignments нь хүсэлт + assignment-уудыг НЭГ транзакцаар
   * үүсгэнэ (assignment-ууд дээр dueAt аль хэдийн тооцоологдсон).
   */
  createRequestWithAssignments(
    ctx: Ctx,
    request: NewRelayRequest,
    assignments: NewRelayAssignment[],
  ): Promise<{ request: RelayRequest; assignments: RelayAssignment[] }>;
  getAssignment(ctx: Ctx, id: string): Promise<RelayAssignment>;
  /**
   * respondAssignment нь assignment-ыг терминал төлөвт (done/rejected) оруулж,
   * бүх assignment терминал болсон бол хүсэлтийг fulfilled болгоно.
   */
  respondAssignment(
    ctx: Ctx,
    assignmentId: string,
    status: string,
    result: unknown,
  ): Promise<{ request: RelayRequest; fulfilled: boolean }>;
  markDispatched(ctx: Ctx, assignmentId: string): Promise<void>;

  // ── SLA sweep-д хэрэглэгдэх query-ууд ────────────────────────────────
  dueSoonAssignments(ctx: Ctx): Promise<RelayAssignment[]>;
  overdueAssignments(ctx: Ctx): Promise<RelayAssignment[]>;
  markAssignmentOverdue(ctx: Ctx, assignmentId: string): Promise<void>;
  incReminders(ctx: Ctx, assignmentId: string): Promise<void>;
  markEscalated(ctx: Ctx, assignmentId: string): Promise<void>;
  markRequestOverdue(ctx: Ctx, requestId: string): Promise<void>;
  /**
   * markBreachNotified нь breach_notified-ыг true болгоно; ШИНЭЭР true болсон
   * (өмнө нь false байсан) бол true буцаана — дээд platform-д зөвхөн НЭГ удаа
   * мэдэгдэхэд ашиглана.
   */
  markBreachNotified(ctx: Ctx, requestId: string): Promise<boolean>;

  // ── Events (timeline + realtime feed) ────────────────────────────────
  appendEvent(ctx: Ctx, input: NewRelayEvent): Promise<void>;

  // ── Dashboard + жагсаалт ─────────────────────────────────────────────
  overview(ctx: Ctx): Promise<RelayOverview>;
  listRequests(ctx: Ctx, limit: number): Promise<RelayRequest[]>;
  getRequestDetail(ctx: Ctx, id: string): Promise<RelayRequestDetail>;
}

export type { RelayEvent };
