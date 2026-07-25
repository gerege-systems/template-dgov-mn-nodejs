import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// DELETE /api/superadmin/invites/{email} — урилгыг цуцлах. Route param нь Next-д
// decode хийгдсэн ирдэг тул backend руу дахин encode хийж дамжуулна.
export async function DELETE(req: Request, props: { params: Promise<{ email: string }> }) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const { email } = await props.params;
  return proxyResult(
    await authedFetch(`/superadmin/invites/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  );
}
