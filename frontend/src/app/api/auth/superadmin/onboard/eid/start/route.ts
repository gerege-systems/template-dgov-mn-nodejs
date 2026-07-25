import { backendFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/superadmin/onboard/eid/start — онбординг eID (QR) эхлүүлэх.
// Invite-gated онбординг тул НЭВТРЭЭГҮЙ (backendFetch). onboard_token-оор
// баталгаажна. Токен үүсэхгүй тул start өгөгдлийг шууд дамжуулна.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await backendFetch('/auth/superadmin/onboard/eid/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
