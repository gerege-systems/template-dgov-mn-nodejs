// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// eID PKI самбарын client-side туслахууд. getJSON нь HTTP статус алддаг тул
// PKI_READ эрхгүй (403)-ыг "эрх хүлээгдэж байна" төлөв болгон ялгахын тулд
// статусыг буцаадаг pkiGet-ийг эндээс хуваалцна (Dashboard + Profile хоёулаа).
import { formatTS } from '@/lib/format';

export interface PkiSummary {
  certificates: { valid: number; revoked: number; expired: number; suspended: number; total: number };
  activity: { authentication: number; signature: number };
  devices_active: number;
  devices_total: number;
  representation_count: number;
}

export interface PkiCertItem {
  document_number: string;
  type: string;
  serial_number: string;
  certificate_level: string;
  status: string;
  not_before?: string;
  not_after?: string;
  issuer_dn?: string;
}

export interface PkiDeviceItem {
  document_number: string;
  platform?: string;
  active: boolean;
  enrolled_at?: string;
  deactivated_at?: string;
  // upstream өргөжихөд буцаах нэмэлт (динамик) талбарууд.
  extra?: Record<string, unknown>;
}

export interface PkiActItem {
  session_id?: string;
  flow: string;
  outcome: string;
  doc_text?: string;
  timestamp?: string;
  // activity service өргөжихөд буцаах нэмэлт (динамик) талбарууд.
  extra?: Record<string, unknown>;
}

// camelCase / snake_case түлхүүрийг уншимжтай шошго болгоно (clientIp → Client ip).
export function humanizeKey(k: string): string {
  const s = k
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Динамик утгыг эмхэтгэн харуулна (объект/массив → JSON, огноо → formatTS).
export function renderVal(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // ISO огноо төстэй бол хүн уншихаар форматлана.
  if (/(at|time|date|timestamp)$/i.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(s)) return formatTS(s);
  return s;
}

/** pkiGet нь backend PKI endpoint-ыг дуудаж {status, data}-г бүрэн буцаана. */
export async function pkiGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  const res = await fetch(path, { method: 'GET' });
  const body = await res.json().catch(() => null);
  return { status: body?.status ?? res.status, data: (body?.ok ? body.data : null) as T | null };
}
