// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// API Gateway-ийн домэйн entity-үүд.
//
// Эдгээр нь gateway-ийн ТОХИРГОО ба телеметр (хэрэглэгч-тус-бүрийн БИШ) тул
// RLS-д хамаарахгүй — roles/permissions-тэй ижил ангилал. Мөн энэ нь жинхэнэ
// runtime proxy БИШ: admin UI-аар удирдагдах бүртгэл + бодит хүсэлтийн лог.

/** GatewayService нь route-ууд proxy хийдэг upstream backend. */
export interface GatewayService {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  path: string;
  retries: number;
  /** connectTimeout нь миллисекундээр. */
  connectTimeout: number;
  tags: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * GatewayRequestLog нь backend руу ирсэн НЭГ бодит хүсэлтийн телеметр бичлэг
 * (middleware бичнэ). Runtime proxy байхгүй тул route/consumer холбоосгүй.
 */
export interface GatewayRequestLog {
  id: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  clientIp: string;
  createdAt: Date;
}

/** GatewayStatusBucket нь статусын ангилал ("2xx".."5xx") + тоо. */
export interface GatewayStatusBucket {
  class: string;
  count: number;
}

/** GatewayPathStat нь хамгийн их хүсэлттэй зам. */
export interface GatewayPathStat {
  path: string;
  count: number;
}

/** GatewayOverview нь dashboard-ийн нэгтгэсэн статистик (сүүлийн 24 цаг). */
export interface GatewayOverview {
  services: number;
  /** consumers нь applications-ийн тоо. */
  consumers: number;
  /** activeKeys нь application_services (service эрх)-ийн тоо. */
  activeKeys: number;
  requests24h: number;
  /** errors24h нь status >= 500. */
  errors24h: number;
  /** rateLimited24h нь status == 429. */
  rateLimited24h: number;
  /** errorRate нь 0..1 (errors / requests). */
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  statusBuckets: GatewayStatusBucket[];
  topPaths: GatewayPathStat[];
}

/**
 * cleanTags нь хоосон/давхардсан tag-уудыг арилгаж, ЭРЭМБЭ хадгална (админы
 * оруулсан дараалал утга учиртай).
 */
export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (t === '' || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
