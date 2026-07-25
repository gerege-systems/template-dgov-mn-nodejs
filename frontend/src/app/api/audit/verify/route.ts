import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/audit/verify — audit hash гинжийн бүрэн бүтэн байдлыг шалгана.
// Backend дээр admin-only хамгаалагдсан.
export async function GET() {
  return proxyResult(await authedFetch('/audit/verify', { method: 'GET' }));
}
