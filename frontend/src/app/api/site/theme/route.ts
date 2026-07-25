import { backendFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/site/theme — идэвхтэй landing theme (нийтийн, auth-гүй).
export async function GET() {
  return proxyResult(await backendFetch('/themes/active', { method: 'GET' }));
}
