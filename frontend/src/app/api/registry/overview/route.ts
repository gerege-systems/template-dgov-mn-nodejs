import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/registry/overview — Ring R1 регистрийн нэгтгэл. registry.view.
export async function GET() {
  return proxyResult(await authedFetch('/registry/overview', { method: 'GET' }));
}
