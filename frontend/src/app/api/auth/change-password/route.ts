import { authedFetch } from '@/lib/api';
import { readJson, toClientResponse, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/change-password — нэвтэрсэн хэрэглэгчийн нууц үг солих. Backend
// тал PUT /auth/password/change (JWT шаардана) руу прокси; access токенг
// cookie-оос авч 401 дээр автоматаар refresh хийнэ.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { current_password, new_password } = await readJson<{
    current_password?: string; new_password?: string;
  }>(req);

  const result = await authedFetch('/auth/password/change', {
    method: 'PUT',
    body: JSON.stringify({ current_password, new_password }),
  });

  return toClientResponse(result);
}
