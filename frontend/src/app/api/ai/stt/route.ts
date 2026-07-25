import { authedFetch } from '@/lib/api';
import { readJson, proxyResult, checkOrigin } from '@/lib/bff';
import { sanitizeAudio, badRequest } from '@/lib/aiBff';

export const dynamic = 'force-dynamic';

// POST /api/ai/stt — яриа→текст. Backend POST /ai/stt руу прокси.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { audio } = await readJson<{ audio?: unknown }>(req);
  const safeAudio = sanitizeAudio(audio);
  if (!safeAudio) return badRequest('Audio буруу эсвэл хэт том байна.');

  return proxyResult(
    await authedFetch('/ai/stt', { method: 'POST', body: JSON.stringify({ audio: safeAudio }) }),
  );
}
