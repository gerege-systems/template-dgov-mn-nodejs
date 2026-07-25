import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/superadmin/admins/by-register?register=... — DAN-д бүртгэлтэй байгаа
// хэрэглэгчийг регистрээр нь урьдчилан харах (preview, эрх олгохгүй). Байхгүй бол 404.
export async function GET(req: Request) {
  const register = new URL(req.url).searchParams.get('register') ?? '';
  return proxyResult(
    await authedFetch(`/superadmin/admins/by-register?register=${encodeURIComponent(register)}`),
  );
}

// POST /api/superadmin/admins/by-register — DAN-д бүртгэлтэй байгаа хэрэглэгчийг
// регистрийн дугаараар нь админ болгох. Register DAN-д бүртгэлгүй бол backend 404.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch('/superadmin/admins/by-register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
