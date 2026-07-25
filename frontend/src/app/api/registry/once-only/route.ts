import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/registry/once-only — ХУР-д байгааг иргэнээс дахин шаардаж буй бүх
// тохиолдол. registry.view. Query-г whitelist хийж дамжуулна.
export async function GET(req: Request) {
  const authority = new URL(req.url).searchParams.get('authority');
  const suffix = authority ? `?authority=${encodeURIComponent(authority)}` : '';
  return proxyResult(await authedFetch(`/registry/once-only${suffix}`, { method: 'GET' }));
}
