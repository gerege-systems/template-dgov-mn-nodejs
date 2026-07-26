// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type {
  GatewayOverview,
  GatewayRequestLog,
  GatewayService,
} from '../../../domain/gateway.js';

export interface GatewayServiceResponse {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  path: string;
  retries: number;
  connect_timeout_ms: number;
  tags: string[];
  enabled: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export const gatewayServiceResponse = (s: GatewayService): GatewayServiceResponse => ({
  id: s.id,
  name: s.name,
  protocol: s.protocol,
  host: s.host,
  port: s.port,
  path: s.path,
  retries: s.retries,
  connect_timeout_ms: s.connectTimeout,
  // null биш ҮРГЭЛЖ массив — клиент `.map` шууд дуудна.
  tags: s.tags,
  enabled: s.enabled,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});

export const gatewayServiceListResponse = (list: GatewayService[]): GatewayServiceResponse[] =>
  list.map(gatewayServiceResponse);

export interface GatewayRequestLogResponse {
  id: string;
  method: string;
  path: string;
  status: number;
  latency_ms: number;
  client_ip: string;
  created_at: Date;
}

export const gatewayLogListResponse = (list: GatewayRequestLog[]): GatewayRequestLogResponse[] =>
  list.map((l) => ({
    id: l.id,
    method: l.method,
    path: l.path,
    status: l.status,
    latency_ms: l.latencyMs,
    client_ip: l.clientIp,
    created_at: l.createdAt,
  }));

export interface GatewayOverviewResponse {
  services: number;
  consumers: number;
  active_keys: number;
  requests_24h: number;
  errors_24h: number;
  rate_limited_24h: number;
  error_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  status_buckets: { class: string; count: number }[];
  top_paths: { path: string; count: number }[];
}

export const gatewayOverviewResponse = (o: GatewayOverview): GatewayOverviewResponse => ({
  services: o.services,
  consumers: o.consumers,
  active_keys: o.activeKeys,
  requests_24h: o.requests24h,
  errors_24h: o.errors24h,
  rate_limited_24h: o.rateLimited24h,
  error_rate: o.errorRate,
  avg_latency_ms: o.avgLatencyMs,
  p95_latency_ms: o.p95LatencyMs,
  status_buckets: o.statusBuckets.map((b) => ({ class: b.class, count: b.count })),
  top_paths: o.topPaths.map((t) => ({ path: t.path, count: t.count })),
});
