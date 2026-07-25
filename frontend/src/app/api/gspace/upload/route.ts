import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/gspace/upload — файл (base64) оруулах. body: { name, data }.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson<{ name?: string; data?: string }>(req);
  if (!body.name || !body.data) {
    return NextResponse.json({ ok: false, status: 400, message: 'Файл дутуу байна' }, { status: 400 });
  }
  return proxyResult(
    await authedFetch('/gspace/upload', {
      method: 'POST',
      body: JSON.stringify({ name: body.name, data: body.data }),
    }),
  );
}
