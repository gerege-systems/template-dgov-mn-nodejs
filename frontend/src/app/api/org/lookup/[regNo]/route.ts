import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Регистрийн дугаар — backend талд max=40, тоо/үсэг. Энгийн ариутгал хийнэ.
const REG_NO_RE = /^[\p{L}\p{N}-]{1,40}$/u;

// GET /api/org/lookup/{regNo} — регистрийн дугаараар байгууллага хайх.
export async function GET(_req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  if (!REG_NO_RE.test(params.regNo)) {
    return NextResponse.json({ ok: false, status: 400, message: 'Регистрийн дугаар буруу байна.' }, { status: 400 });
  }
  return proxyResult(await authedFetch(`/org/lookup/${encodeURIComponent(params.regNo)}`, { method: 'GET' }));
}
