// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/ai нь Gemini-д суурилсан AI pipeline-ийг хэрэгжүүлнэ:
//
//   хэрэглэгчийн асуулт (текст/audio) → Gemini (function calling) →
//   backend tool гүйцэтгэл → үр дүнг Gemini руу буцаах → эцсийн Монгол хариулт
//
// AI ямар tool дуудахаа ШИЙДНЭ, backend ГҮЙЦЭТГЭНЭ — model хэзээ ч өөрөө
// код ажиллуулахгүй. Чатын хувьд Gemini бүх оролдлогын дараа ч амжилтгүй
// бол хэрэглэгчид Монгол fallback мессеж буцаана (хүсэлт унагахгүй).
//
// Мөн дуу хоолойн боломжууд: transcribe (STT), speak (TTS), translate
// (текст/audio → зорилтот хэл, сонголтоор дуут гаралт) — live орчуулгын
// урсгал нь frontend-ээс жижиг audio chunk-уудыг translate руу дамжуулж
// бүтдэг.

import type { AIPrompt } from '../../domain/ai.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

/** Audio нь base64 кодлогдсон оролтын дуу (browser MediaRecorder chunk). */
export interface Audio {
  mime: string;
  /** data нь base64. */
  data: string;
}

/** Turn нь өмнөх харилцааны нэг ээлж. role: "user" | "model". */
export interface Turn {
  role: string;
  text: string;
}

export interface RunRequest {
  prompt: string;
  /** audio нь сонголттой — дуут мессеж (audio ойлголт). */
  audio?: Audio | null;
  history: Turn[];
}

/**
 * Step нь pipeline-ийн гүйцэтгэсэн нэг tool дуудлагын ул мөр — frontend
 * "AI юу хийснийг" харуулахад ашиглаж болно.
 */
export interface Step {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface RunResult {
  reply: string;
  steps: Step[];
  /** degraded нь Gemini амжилтгүй болж fallback мессеж буцаасныг заана. */
  degraded: boolean;
}

export interface TranscribeRequest {
  audio: Audio;
}

export interface TranscribeResult {
  text: string;
}

export interface SpeakRequest {
  text: string;
  /** voice хоосон бол өгөгдмөл дуу хоолой. */
  voice: string;
}

export interface SpeakResult {
  mime: string;
  /** data нь base64 (audio/wav). */
  data: string;
}

export interface TranslateRequest {
  /** text эсвэл audio-гийн аль нэг нь заавал. */
  text: string;
  audio?: Audio | null;
  /** targetLang нь ISO код эсвэл хэлний нэр ("mn", "en", ...). */
  targetLang: string;
  /** speak үнэн бол орчуулгыг TTS-ээр дуут болгож хавсаргана. */
  speak: boolean;
}

export interface TranslateResult {
  /** sourceText нь audio оролттой үед STT-ийн үр дүн. */
  sourceText: string;
  translated: string;
  /** audio нь speak=true үед л ирнэ. */
  audio: SpeakResult | null;
}

/** AIUsecase нь AI pipeline-ийн оролтын хил юм. */
export interface AIUsecase {
  /**
   * run нь нэг чат хүсэлтийг pipeline-аар бүрэн гүйцэтгэж эцсийн хариултыг
   * буцаана. Gemini-ийн түр зуурын алдааг fallback мессежээр (degraded=true)
   * намжаана; зөвхөн тохиргооны алдааг error болгоно.
   */
  run(ctx: Ctx, req: RunRequest): Promise<RunResult>;

  /** listPrompts нь тохируулдаг prompt давхаргуудыг буцаана (админ UI). */
  listPrompts(ctx: Ctx): Promise<AIPrompt[]>;
  /** setPrompt нь нэг давхаргын агуулгыг сольж, кэшийг хүчингүй болгоно. */
  setPrompt(ctx: Ctx, key: string, content: string): Promise<void>;

  /** transcribe нь audio-г текст болгоно (STT). */
  transcribe(ctx: Ctx, req: TranscribeRequest): Promise<TranscribeResult>;

  /**
   * speak нь текстийг яриа болгоно (TTS) — browser-т шууд тоглуулах
   * боломжтой WAV буцаана.
   */
  speak(ctx: Ctx, req: SpeakRequest): Promise<SpeakResult>;

  /**
   * translate нь текст эсвэл audio-г зорилтот хэл рүү орчуулна; speak үнэн
   * бол орчуулгын дуут (TTS) хувилбарыг хамт буцаана.
   */
  translate(ctx: Ctx, req: TranslateRequest): Promise<TranslateResult>;
}
