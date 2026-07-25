import { authedFetch } from '@/lib/api';
import { readJson, proxyResult, checkOrigin } from '@/lib/bff';
import { sanitizeAudio, badRequest } from '@/lib/aiBff';

export const dynamic = 'force-dynamic';

interface ChatTurn {
  role?: unknown;
  text?: unknown;
}

// POST /api/ai/chat — AI туслахын чат (текст ба/эсвэл дуут мессеж). Backend
// POST /ai/chat (JWT шаардана) руу прокси; reply/steps/degraded өгөгдлийг
// клиент рүү дамжуулна (токен агуулдаггүй).
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { message, audio, history } = await readJson<{
    message?: unknown;
    audio?: unknown;
    history?: ChatTurn[];
  }>(req);

  const text = typeof message === 'string' ? message.trim() : '';
  const safeAudio = sanitizeAudio(audio);
  if ((!text && !safeAudio) || text.length > 4000) {
    return badRequest('Мессеж хоосон эсвэл хэт урт байна.');
  }

  const safeHistory = (Array.isArray(history) ? history : [])
    .filter((t) => (t?.role === 'user' || t?.role === 'model') && typeof t?.text === 'string')
    .slice(-20)
    .map((t) => ({ role: t.role as string, text: (t.text as string).slice(0, 4000) }));

  return proxyResult(
    await authedFetch('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: text,
        ...(safeAudio ? { audio: safeAudio } : {}),
        history: safeHistory,
      }),
    }),
  );
}
