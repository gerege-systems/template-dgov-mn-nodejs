import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// Backend-ийн зөвшөөрдөг давхаргын түлхүүрүүд — гадуурх key-г энд таслана.
const PROMPT_KEYS = new Set(['scope', 'instructions']);

// PUT /api/admin/ai/prompts/{key} — нэг prompt давхаргын агуулгыг солих.
export async function PUT(req: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  if (!PROMPT_KEYS.has(params.key)) {
    return NextResponse.json({ ok: false, status: 400, message: 'Prompt key буруу байна.' }, { status: 400 });
  }

  const { content } = await readJson<{ content?: unknown }>(req);
  if (typeof content !== 'string' || content.length > 4000) {
    return NextResponse.json({ ok: false, status: 400, message: 'Агуулга буруу эсвэл хэт урт байна.' }, { status: 400 });
  }

  return proxyResult(
    await authedFetch(`/admin/ai/prompts/${params.key}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  );
}
