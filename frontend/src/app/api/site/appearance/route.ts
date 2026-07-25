import { backendFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/site/appearance — сайтын нийтийн харагдацын default (accent · font ·
// style · theme). Нийтийн (auth-гүй) — landing болон админ UI хоёулаа уншина.
export async function GET() {
  return proxyResult(await backendFetch('/site/appearance', { method: 'GET' }));
}
