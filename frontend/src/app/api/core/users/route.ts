import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/core/users?search_text= — Gerege Core хэрэглэгч хайх (backend proxy).
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get('search_text') ?? '';
  return proxyResult(await authedFetch(`/core/users?search_text=${encodeURIComponent(s)}`, { method: 'GET' }));
}
