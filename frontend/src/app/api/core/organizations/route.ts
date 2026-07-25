import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/core/organizations?search_text= — Gerege Core байгууллага хайх.
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get('search_text') ?? '';
  return proxyResult(await authedFetch(`/core/organizations?search_text=${encodeURIComponent(s)}`, { method: 'GET' }));
}
