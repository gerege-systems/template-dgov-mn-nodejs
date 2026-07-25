import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET /api/sign/[id]/download — гарын үсэгтэй PDF-ийг backend-ээс stream хийж
// browser руу дамжуулна (content-type / content-disposition-ийг хадгална).
const BASE = (process.env.BACKEND_URL ?? 'http://localhost:8080').replace(/\/$/, '') + '/api/v1';

// Sign session id нь backend randID() — 32 hex тэмдэгт (UUID биш).
const SIGN_ID_RE = /^[a-f0-9]{32}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SIGN_ID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const tok = await getAccessToken();
  if (!tok) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const upstream = await fetch(
      `${BASE}/sign/${encodeURIComponent(id)}/download`,
      { headers: { Authorization: `Bearer ${tok}` }, cache: 'no-store' },
    );
    if (!upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, { status: upstream.status });
    }
    const headers = new Headers();
    headers.set('content-type', upstream.headers.get('content-type') ?? 'application/pdf');
    headers.set('content-disposition', upstream.headers.get('content-disposition') ?? 'attachment; filename="signed.pdf"');
    return new NextResponse(upstream.body, { headers });
  } catch {
    return NextResponse.json({ error: 'backend_unreachable' }, { status: 503 });
  }
}
