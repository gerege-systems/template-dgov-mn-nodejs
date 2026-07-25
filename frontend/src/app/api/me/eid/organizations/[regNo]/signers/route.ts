import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// Байгууллагын гарын үсэг зурагчид — нэвтэрсэн иргэн тухайн байгууллагын төлөөлөгч
// байх ёстой (backend eidmongolia талд шалгана).

// GET — жагсаалт.
export async function GET(_req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  return proxyResult(
    await authedFetch(`/users/me/eid/organizations/${encodeURIComponent(params.regNo)}/signers`, { method: 'GET' }),
  );
}

// POST — өөр иргэнийг (РД) гарын үсэг зурах эрхтэй болгож нэмнэ.
export async function POST(req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch(`/users/me/eid/organizations/${encodeURIComponent(params.regNo)}/signers`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

// DELETE — гарын үсэг зурагчийг (?signer=РД) хасна.
export async function DELETE(req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  const signer = new URL(req.url).searchParams.get('signer') ?? '';
  return proxyResult(
    await authedFetch(
      `/users/me/eid/organizations/${encodeURIComponent(params.regNo)}/signers?signer=${encodeURIComponent(signer)}`,
      { method: 'DELETE' },
    ),
  );
}
