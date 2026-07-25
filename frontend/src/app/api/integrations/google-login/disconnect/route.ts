import { NextResponse } from 'next/server';
import { checkOrigin } from '@/lib/bff';
import { authedFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

// POST /api/integrations/google-login/disconnect — нэвтэрсэн хэрэглэгчийн Google
// холболтыг (users.google_sub + профайл) арилгана. Mutating тул checkOrigin
// (x-dgov-csrf + Origin) эхэлж шалгана; postJSON-оор дуудна.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const r = await authedFetch('/auth/google/link', { method: 'DELETE' });
  if (!r.ok) {
    return NextResponse.json({ ok: false, status: 502, message: 'Салгахад алдаа гарлаа.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
