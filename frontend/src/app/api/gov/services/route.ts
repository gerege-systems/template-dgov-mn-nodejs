import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function GET() {
  return proxyResult(await authedFetch('/gov/services', { method: 'GET' }));
}
