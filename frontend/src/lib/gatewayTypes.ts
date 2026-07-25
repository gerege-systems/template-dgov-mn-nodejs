// API Gateway-ийн BFF (/api/gateway/*) хариунуудын TypeScript хэлбэрүүд. Эдгээр
// нь backend-ийн responses_gateway.go-той тэнцүү (json tag-аар).

export interface GwService {
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
  created_at: string;
  updated_at: string | null;
}

export interface GwLog {
  id: string;
  method: string;
  path: string;
  status: number;
  latency_ms: number;
  client_ip: string;
  created_at: string;
}

export interface GwOverview {
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
