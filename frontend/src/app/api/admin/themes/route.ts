import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/admin/themes — theme жагсаалт (backend settings.manage-ээр хамгаална).
export async function GET() {
  return proxyResult(await authedFetch('/themes', { method: 'GET' }));
}

// POST /api/admin/themes — шинэ theme үүсгэх. Нарийн шалгалт backend-д.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const { name, config } = await readJson<{ name?: unknown; config?: unknown }>(req);
  if (typeof name !== 'string' || name.trim() === '' || name.length > 80) {
    return NextResponse.json({ ok: false, status: 400, message: 'Нэр буруу байна.' }, { status: 400 });
  }
  return proxyResult(
    await authedFetch('/themes', {
      method: 'POST',
      body: JSON.stringify({ name, config: config ?? {} }),
    }),
  );
}
