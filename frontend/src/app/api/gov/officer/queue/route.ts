import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// Шүүлтүүрийг зөвшөөрөгдсөн түлхүүрээр л дамжуулна — клиентийн дурын query
// string backend руу шууд урсахаас сэргийлнэ.
const ALLOWED = ['status', 'assigned_to', 'overdue', 'limit', 'offset'] as const;

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams;
  const qs = new URLSearchParams();
  for (const k of ALLOWED) {
    const v = src.get(k);
    if (v) qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return proxyResult(await authedFetch(`/gov/officer/queue${suffix}`, { method: 'GET' }));
}
