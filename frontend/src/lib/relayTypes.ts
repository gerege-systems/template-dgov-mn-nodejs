// Government Template Platform V3.0
// Platform-хоорондын хүсэлт дамжуулах + SLA хяналтын frontend типүүд (backend
// responses_relay.go-ийн snake_case DTO-той тохирно).

export interface RelayStatusBucket {
  status: string;
  count: number;
}

export interface RelayPlatformStat {
  platform_id: string;
  platform_name: string;
  total: number;
  done: number;
  overdue: number;
  pending: number;
  compliance_pct: number;
}

export interface RelayEvent {
  id: string;
  request_id: string;
  assignment_id?: string;
  type: string;
  detail: string;
  created_at: string;
}

export interface RelayOverview {
  received_today: number;
  in_progress: number;
  overdue: number;
  fulfilled: number;
  total: number;
  sla_compliance_pct: number;
  avg_fulfill_mins: number;
  status_buckets: RelayStatusBucket[];
  platforms: RelayPlatformStat[];
  recent_events: RelayEvent[];
}

export interface RelayRequest {
  id: string;
  source_platform: string;
  external_ref: string;
  service_code: string;
  title: string;
  priority: string;
  received_at: string;
  due_at: string;
  status: string;
  fulfilled_at?: string;
  breach_notified: boolean;
}

export interface RelayAssignment {
  id: string;
  request_id: string;
  platform_id: string;
  platform_name: string;
  status: string;
  due_at: string;
  dispatched_at?: string;
  responded_at?: string;
  reminders_sent: number;
  escalated: boolean;
}

export interface RelayRequestDetail {
  request: RelayRequest;
  assignments: RelayAssignment[];
  events: RelayEvent[];
}

export interface RelayPlatform {
  id: string;
  code: string;
  name: string;
  direction: 'upstream' | 'downstream';
  endpoint_url: string;
  supervisor_contact: string;
  webhook_secret: string;
  enabled: boolean;
  created_at: string;
}

export interface RelayRoute {
  id: string;
  service_code: string;
  platform_id: string;
  platform_name: string;
  sla_minutes: number;
  created_at: string;
}
