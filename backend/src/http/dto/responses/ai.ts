// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { AIPrompt } from '../../../domain/ai.js';
import type { RunResult, SpeakResult, TranslateResult } from '../../../usecases/ai/ai_usecase.js';

/**
 * AIChatStepResponse нь pipeline-ийн гүйцэтгэсэн нэг tool дуудлага —
 * frontend "AI юу хийснийг" харуулахад ашиглана.
 */
export interface AIChatStepResponse {
  tool: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

/** AIChatResponse нь POST /ai/chat-ийн data хэсэг. */
export interface AIChatResponse {
  reply: string;
  steps?: AIChatStepResponse[];
  degraded?: boolean;
}

/** aiChatResponse нь usecase-ийн үр дүнг HTTP DTO руу буулгана. */
export function aiChatResponse(res: RunResult): AIChatResponse {
  const out: AIChatResponse = { reply: res.reply };
  // Go хувилбарт `omitempty` — хоосон steps/degraded талбар JSON-д ГАРАХГҮЙ.
  if (res.steps.length > 0) {
    out.steps = res.steps.map((s) => ({
      tool: s.tool,
      ...(Object.keys(s.args).length > 0 ? { args: s.args } : {}),
      ...(Object.keys(s.result).length > 0 ? { result: s.result } : {}),
    }));
  }
  if (res.degraded) out.degraded = true;
  return out;
}

/** AIAudioOut нь base64 кодлогдсон дуут гаралт (ихэвчлэн audio/wav). */
export interface AIAudioOut {
  mime: string;
  data: string;
}

/** AISTTResponse нь POST /ai/stt-ийн data хэсэг. */
export interface AISTTResponse {
  text: string;
}

/** AITranslateResponse нь POST /ai/translate-ийн data хэсэг. */
export interface AITranslateResponse {
  source_text: string;
  translated: string;
  audio?: AIAudioOut;
}

/** aiAudioOut нь TTS үр дүнг DTO болгоно. */
export const aiAudioOut = (res: SpeakResult): AIAudioOut => ({ mime: res.mime, data: res.data });

/** aiTranslateResponse нь usecase-ийн орчуулгын үр дүнг HTTP DTO руу буулгана. */
export function aiTranslateResponse(res: TranslateResult): AITranslateResponse {
  const out: AITranslateResponse = { source_text: res.sourceText, translated: res.translated };
  if (res.audio) out.audio = aiAudioOut(res.audio);
  return out;
}

/** AIPromptResponse нь тохируулдаг нэг prompt давхарга. */
export interface AIPromptResponse {
  key: string;
  content: string;
  updated_at?: string;
}

/** aiPromptListResponse нь domain prompt-уудыг HTTP DTO руу буулгана. */
export function aiPromptListResponse(list: AIPrompt[]): AIPromptResponse[] {
  return list.map((p) => ({
    key: p.key,
    content: p.content,
    ...(p.updatedAt ? { updated_at: p.updatedAt.toISOString() } : {}),
  }));
}
