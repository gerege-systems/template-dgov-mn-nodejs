import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/admin/ai/prompts — AI prompt давхаргуудын жагсаалт.
// settings.manage эрхээр хамгаалагдсан (backend дээр).
export async function GET() {
  return proxyResult(await authedFetch('/admin/ai/prompts', { method: 'GET' }));
}
