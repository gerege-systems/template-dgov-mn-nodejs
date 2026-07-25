import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

// GET /api/auth/sso/start — dgov SSO (sso.dgov.mn, OIDC) нэвтрэлт эхлүүлэх.
// Backend /sso/start нь state үүсгэж (Redis), authorize URL буцаана; browser-ийг
// тийш чиглүүлнэ. Landing дээрх "dgov SSO-гоор нэвтрэх" товч энд заана.
export async function GET() {
  const r = await backendFetch<{ auth_url?: string }>('/sso/start', { method: 'POST' });
  const authURL = r.ok ? r.data?.auth_url : undefined;
  if (!authURL) {
    // Relative Location — nginx-ийн ард origin буруу гарахаас сэргийлнэ.
    return new NextResponse(null, { status: 303, headers: { Location: '/login?error=sso' } });
  }
  // authURL нь sso.dgov.mn-ий абсолют URL — шууд redirect.
  return NextResponse.redirect(authURL);
}
