// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Дуу хоолойн боломжуудын (STT / TTS / орчуулга) тогтмолууд ба цэвэр
// туслахууд. Чатаас ялгаатай нь эдгээр урсгал fallback мессеж буцаадаггүй —
// алдааг шууд error болгож өгнө (дуудагч UI өөрөө "дахин оролд" гэж харуулна).

import { internalCause } from '../../apperror/index.js';
import type { Blob } from '../../pkg/gemini/gemini.js';
import { pcmRateFromMime, pcmToWav } from '../../pkg/gemini/wav.js';
import type { SpeakResult } from './ai_usecase.js';

/** sttInstruction нь STT-ийн тогтмол дүрэм — зөвхөн сонссоноо буцаана. */
export const sttInstruction =
  'Чи яриа-текст (STT) хөрвүүлэгч. Өгсөн audio-д сонсогдсон яриаг ' +
  'яг хэлсэн хэлээр нь, үг үсгийн алдаагүй, тайлбаргүйгээр зөвхөн текст болгон буцаа. ' +
  'Яриа сонсогдохгүй бол хоосон мөр буцаа.';

/**
 * langNames нь түгээмэл хэлний кодыг хүний нэр рүү буулгана — prompt-д
 * ойлгомжтой болгох зорилготой; жагсаалтад байхгүй кодыг байгаагаар нь өгнө.
 */
export const langNames: Record<string, string> = {
  mn: 'Монгол',
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
};

/** translateInstruction нь орчуулгын system prompt-ыг зорилтот хэлээр бүтээнэ. */
export function translateInstruction(target: string): string {
  return (
    `Чи мэргэжлийн синхрон орчуулагч. Өгсөн текстийг ${target} хэл рүү орчуулж ` +
    'ЗӨВХӨН орчуулсан текстийг буцаа — тайлбар, хашилт, оршил бүү нэм. ' +
    'Текст аль хэдийн зорилтот хэл дээр байвал хэвээр нь буцаа.'
  );
}

/**
 * toWav нь TTS-ийн түүхий PCM гаралтыг browser тоглуулж чадах WAV болгоно;
 * model өөр контейнер форматтай буцаавал байгаагаар нь дамжуулна.
 */
export function toWav(blob: Blob): SpeakResult {
  const mime = blob.mimeType.toLowerCase();
  if (!mime.includes('l16') && !mime.includes('pcm')) {
    return { mime: blob.mimeType, data: blob.data };
  }
  let pcm: Buffer;
  try {
    pcm = Buffer.from(blob.data, 'base64');
  } catch (err) {
    throw internalCause(new Error(`ai speak: decode pcm: ${String(err)}`));
  }
  const wav = pcmToWav(pcm, pcmRateFromMime(blob.mimeType));
  return { mime: 'audio/wav', data: wav.toString('base64') };
}
