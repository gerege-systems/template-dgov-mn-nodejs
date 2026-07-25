// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/relay нь platform-хоорондын үйлчилгээний хүсэлт дамжуулах + SLA
// хяналтын business logic. Дээд platform-оос хугацаатай хүсэлт хүлээж авч
// (ingest), routing дүрмээр доод platform-ууд руу дамжуулж, заагдсан хугацаанд
// биелэлтийг хянаж/шахаж (slaSweep), хариуг цуглуулна (respond).

import type {
  RelayOverview,
  RelayPlatform,
  RelayRequest,
  RelayRequestDetail,
  RelayRoute,
} from '../../domain/relay.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

/**
 * IngestInput нь дээд platform-оос ирэх хүсэлт. dueAt хоосон бол routing-ийн
 * хамгийн урт SLA-аар тооцно.
 */
export interface IngestInput {
  sourcePlatform: string;
  externalRef: string;
  serviceCode: string;
  title: string;
  payload: unknown;
  priority: string;
  dueAt: Date | null;
}

/** RespondInput нь доод platform-ын хариу. status = done | rejected. */
export interface RespondInput {
  status: string;
  result: unknown;
}

export interface PlatformInput {
  code: string;
  name: string;
  /** direction: upstream | downstream (хоосон бол downstream). */
  direction: string;
  endpointUrl: string;
  supervisorContact: string;
  /** webhookSecret хоосон бол автоматаар үүсгэнэ. */
  webhookSecret: string;
  enabled: boolean;
}

export interface RouteInput {
  serviceCode: string;
  platformId: string;
  slaMinutes: number;
}

export interface RelayUsecase {
  /**
   * ingest нь дээд platform-оос ирсэн хүсэлтийг хүлээж авч, routing дүрмээр
   * assignment үүсгэн доод platform-ууд руу дамжуулна.
   */
  ingest(ctx: Ctx, input: IngestInput): Promise<RelayRequest>;
  /** respond нь доод platform-ын callback — assignment-ыг терминал болгоно. */
  respond(ctx: Ctx, assignmentId: string, input: RespondInput): Promise<void>;

  /**
   * receiveWebhook нь бүртгэлтэй peer (дээд эсвэл доод) platform-оос ирсэн
   * webhook-ийг HMAC гарын үсгээр баталгаажуулж, шинэ хүсэлт болгон ingest хийнэ.
   */
  receiveWebhook(
    ctx: Ctx,
    sourceCode: string,
    signature: string,
    body: Buffer,
  ): Promise<RelayRequest>;
  /**
   * forwardUp нь хүсэлтийг сонгосон дээд (upstream) platform руу webhook-оор
   * дамжуулна (тайлагнах/шат ахиулах).
   */
  forwardUp(ctx: Ctx, requestId: string, platformCode: string): Promise<void>;

  /** slaSweep нь background worker-ийн нэг алхам: reminder/overdue/breach/escalate. */
  slaSweep(ctx: Ctx): Promise<void>;
  /**
   * simulateStep нь demo (scaffold) — доод platform-уудын нэрийн өмнөөс хариу
   * үүсгэж, зарим хүсэлтийг overdue болгоно (dashboard-ыг өөрөө хөдөлгөнө).
   */
  simulateStep(ctx: Ctx): Promise<void>;
  /**
   * simulateIngest нь demo (scaffold) — санамсаргүй service_code-оор шинэ демо
   * хүсэлт (богино SLA цонхтой) ingest хийнэ.
   */
  simulateIngest(ctx: Ctx): Promise<void>;

  // ── Dashboard + жагсаалт ─────────────────────────────────────────────
  overview(ctx: Ctx): Promise<RelayOverview>;
  listRequests(ctx: Ctx, limit: number): Promise<RelayRequest[]>;
  getRequest(ctx: Ctx, id: string): Promise<RelayRequestDetail>;

  // ── Platforms / routes (admin) ───────────────────────────────────────
  listPlatforms(ctx: Ctx): Promise<RelayPlatform[]>;
  createPlatform(ctx: Ctx, input: PlatformInput): Promise<RelayPlatform>;
  deletePlatform(ctx: Ctx, id: string): Promise<void>;
  listRoutes(ctx: Ctx): Promise<RelayRoute[]>;
  createRoute(ctx: Ctx, input: RouteInput): Promise<RelayRoute>;
  deleteRoute(ctx: Ctx, id: string): Promise<void>;
}
