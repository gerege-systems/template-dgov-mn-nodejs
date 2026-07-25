import { NextResponse } from 'next/server';
import { getIntegration } from '@/lib/integrations';
import { checkOrigin } from '@/lib/bff';
import { authedFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

// POST /api/integrations/:provider/disconnect
// Backend-аас хадгалсан токеныг (хэрэглэгчийн session-тэйгээр) устгаж холболтыг
// салгана. Mutating тул checkOrigin (x-dgov-csrf header + Origin)-ийг эхэлж
// шалгана — postJSON-оор дуудна.
export async function POST(req: Request, props: { params: Promise<{ provider: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;

  const provider = getIntegration(params.provider);
  if (!provider) {
    return NextResponse.json({ ok: false, status: 404, message: 'Тодорхойгүй үйлчилгээ.' }, { status: 404 });
  }

  const r = await authedFetch(`/integrations/${provider.id}`, { method: 'DELETE' });
  if (!r.ok) {
    return NextResponse.json({ ok: false, status: 502, message: 'Backend алдаа.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
