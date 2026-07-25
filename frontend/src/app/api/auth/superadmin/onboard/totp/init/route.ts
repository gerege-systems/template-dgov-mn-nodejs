import { backendFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/superadmin/onboard/totp/init — TOTP secret + otpauth_url үүсгэх.
// otpauth_url-ийг клиент QR болгож харуулна; secret-ийг гар оруулгад үзүүлнэ.
// Invite-gated тул НЭВТРЭЭГҮЙ (onboard_token-оор).
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await backendFetch('/auth/superadmin/onboard/totp/init', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
