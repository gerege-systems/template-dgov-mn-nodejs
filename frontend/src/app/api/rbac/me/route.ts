import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/rbac/me — нэвтэрсэн хэрэглэгчийн эрхийн түлхүүрүүд (цэс шүүхэд).
export async function GET() {
  return proxyResult(await authedFetch<string[]>('/rbac/me', { method: 'GET' }));
}
