import { authedFetch } from '@/lib/api';
import { readJson, proxyResult, checkOrigin } from '@/lib/bff';
import { badRequest } from '@/lib/aiBff';

export const dynamic = 'force-dynamic';

// POST /api/ai/tts — текст→яриа (WAV base64). Backend POST /ai/tts руу прокси.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { text } = await readJson<{ text?: unknown }>(req);
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
    return badRequest('Текст хоосон эсвэл хэт урт байна.');
  }

  return proxyResult(
    await authedFetch('/ai/tts', { method: 'POST', body: JSON.stringify({ text: text.trim() }) }),
  );
}
