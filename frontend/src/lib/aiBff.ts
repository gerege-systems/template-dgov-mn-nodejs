import 'server-only';
import { NextResponse } from 'next/server';

// AI BFF route-уудын хуваалцсан audio validation. Backend дээр нарийн
// validation бий — энд зөвхөн хэлбэрийг whitelist хийж бөөн/буруу
// payload-ийг эртхэн таслана.

const AUDIO_MIMES = new Set([
  'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg',
  'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/flac',
]);

const MAX_AUDIO_B64 = 716800; // ~700 KB base64 — backend DTO-той ижил

export interface SafeAudio {
  mime: string;
  data: string;
}

/**
 * Клиентээс ирсэн audio объектыг шалгаж цэвэр хэлбэрт буулгана.
 * mime-ийн codec параметрийг хасна ("audio/webm;codecs=opus" → "audio/webm").
 * Буруу бол null (байхгүйтэй адил) — шаардлагатай эсэхийг дуудагч шийднэ.
 */
export function sanitizeAudio(raw: unknown): SafeAudio | null {
  if (!raw || typeof raw !== 'object') return null;
  const { mime, data } = raw as { mime?: unknown; data?: unknown };
  if (typeof mime !== 'string' || typeof data !== 'string') return null;
  const cleanMime = mime.split(';')[0].trim().toLowerCase();
  if (!AUDIO_MIMES.has(cleanMime)) return null;
  if (!data || data.length > MAX_AUDIO_B64) return null;
  return { mime: cleanMime, data };
}

/** Нэгдсэн 400 хариу. */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ ok: false, status: 400, message }, { status: 400 });
}
