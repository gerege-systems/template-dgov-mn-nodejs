// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /ai/* endpoint-ууд — Gemini-д суурилсан AI pipeline-тэй чат харилцаа,
// яриа-текст (STT), текст-яриа (TTS) болон шууд орчуулга. Мөн админы
// /admin/ai/prompts гадаргуу (prompt давхаргын уншилт/засвар) энд байрлана.

import { z } from 'zod';

import { rule, strictObject } from '../../../../pkg/validators/validators.js';
import type { AIUsecase } from '../../../../usecases/ai/ai_usecase.js';
import {
  aiAudioOut,
  aiChatResponse,
  aiPromptListResponse,
  aiTranslateResponse,
} from '../../../dto/responses/ai.js';
import { decodeBody, newErrorResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * base64Rule нь Go-ийн `validate:"base64"` tag-ийг тусгана — Buffer.from нь
 * буруу тэмдэгтийг ЧИМЭЭГҮЙ тайрдаг тул ил шалгах ёстой.
 */
const base64Rule = rule<string>('base64', (v) => {
  if (v === '' || v.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(v);
});

/**
 * audioSchema нь base64 кодлогдсон оролтын дуу. mime нь browser
 * MediaRecorder-ийн гаргадаг түгээмэл audio төрлүүдээр хязгаарлагдана; data нь
 * ~700 KB base64 (~520 KB түүхий, opus-аар ~30 секунд) — глобал body хязгаарт
 * багтана.
 */
const audioSchema = strictObject({
  mime: z.enum([
    'audio/webm',
    'audio/ogg',
    'audio/wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/aac',
    'audio/flac',
  ]),
  data: z.string().min(1).max(716_800).superRefine(base64Rule),
});

/** turnSchema нь өмнөх харилцааны нэг ээлж. role: "user" | "model". */
const turnSchema = strictObject({
  role: z.enum(['user', 'model']),
  text: z.string().min(1).max(4000),
});

/**
 * chatSchema нь POST /ai/chat-ийн body. message эсвэл audio-гийн ядаж нэг нь
 * шаардлагатай (handler шалгана) — дуут мессежийг AI шууд ойлгоно. history нь
 * сонголттой: frontend өмнөх ээлжүүдээ дамжуулж харилцааг үргэлжлүүлнэ
 * (сервер талд чат төлөв хадгалдаггүй, stateless).
 */
const chatSchema = strictObject({
  message: z.string().max(4000).optional(),
  audio: audioSchema.nullish(),
  history: z.array(turnSchema).max(20).optional(),
});

/** sttSchema нь POST /ai/stt-ийн body — audio-г текст болгоно. */
const sttSchema = strictObject({ audio: audioSchema });

/** ttsSchema нь POST /ai/tts-ийн body — текстийг яриа болгоно. */
const ttsSchema = strictObject({
  text: z.string().min(1).max(2000),
  voice: z
    .string()
    .max(40)
    .regex(/^[a-zA-Z0-9]*$/, '@alphanum')
    .optional(),
});

/**
 * translateSchema нь POST /ai/translate-ийн body. text эсвэл audio-гийн ядаж
 * нэг нь шаардлагатай (handler шалгана); speak үнэн бол орчуулгын дуут (TTS)
 * хувилбар хамт ирнэ. Live орчуулга = frontend жижиг audio chunk-уудыг энэ
 * endpoint руу дараалан илгээх урсгал.
 */
const translateSchema = strictObject({
  text: z.string().max(4000).optional(),
  audio: audioSchema.nullish(),
  target_lang: z.string().min(2).max(20),
  speak: z.boolean().optional(),
});

/**
 * promptUpdateSchema нь PUT /admin/ai/prompts/{key}-ийн body. Хоосон content
 * зөвшөөрөгдөнө (давхаргыг цэвэрлэх) — scope хоосон бол env/default fallback
 * хэрэглэгдэнэ.
 */
const promptUpdateSchema = strictObject({ content: z.string().max(4000) });

/** pathParam нь замын сегментийг мөр болгоно (Express нь массив өгч болно). */
const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

export class AIHandler {
  constructor(private readonly usecase: AIUsecase) {}

  /**
   * chat нь хэрэглэгчийн мессежийг (текст эсвэл audio) pipeline-аар
   * боловсруулж Монгол хариулт буцаана. AI үйлчилгээ түр унавал
   * degraded=true + fallback мессеж ирнэ (5xx БИШ).
   *
   * POST /ai/chat · Bearer · 200 · 400 · 401 · 422 · 429
   */
  chat: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, chatSchema);
    const message = body.message ?? '';
    const audio = body.audio ?? null;
    if (message === '' && !audio) {
      newErrorResponse(req, res, 400, 'message or audio is required');
      return;
    }

    const result = await this.usecase.run(req.ctx, {
      prompt: message,
      audio,
      history: body.history ?? [],
    });
    newSuccessResponse(req, res, 200, 'ai reply generated', aiChatResponse(result));
  };

  /**
   * transcribe нь base64 audio-г текст болгоно. Яриа илрээгүй бол хоосон text.
   *
   * POST /ai/stt · Bearer · 200 · 400 · 401 · 422 · 429
   */
  transcribe: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, sttSchema);
    const result = await this.usecase.transcribe(req.ctx, { audio: body.audio });
    newSuccessResponse(req, res, 200, 'audio transcribed', { text: result.text });
  };

  /**
   * speak нь текстийг Gemini TTS model-ээр дуут (audio/wav, base64) болгоно.
   *
   * POST /ai/tts · Bearer · 200 · 400 · 401 · 422 · 429
   */
  speak: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, ttsSchema);
    const result = await this.usecase.speak(req.ctx, {
      text: body.text,
      voice: body.voice ?? '',
    });
    newSuccessResponse(req, res, 200, 'speech generated', aiAudioOut(result));
  };

  /**
   * translate нь текст эсвэл audio-г зорилтот хэл рүү орчуулна. Audio өгвөл
   * эхлээд STT хийгээд орчуулдаг; speak=true бол дуут хувилбарыг хамт буцаана.
   * Чимээгүй chunk-д хоосон үр дүн буцаана (алдаа БИШ).
   *
   * POST /ai/translate · Bearer · 200 · 400 · 401 · 422 · 429
   */
  translate: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, translateSchema);
    const text = body.text ?? '';
    const audio = body.audio ?? null;
    if (text === '' && !audio) {
      newErrorResponse(req, res, 400, 'text or audio is required');
      return;
    }

    const result = await this.usecase.translate(req.ctx, {
      text,
      audio,
      targetLang: body.target_lang,
      speak: body.speak ?? false,
    });
    newSuccessResponse(req, res, 200, 'translated', aiTranslateResponse(result));
  };

  /**
   * listPrompts нь тохируулдаг prompt давхаргуудыг буцаана. Suurь (base)
   * дүрэм кодод хатуу бичигдсэн тул энд харагдахгүй, өөрчлөгдөхгүй.
   *
   * GET /admin/ai/prompts · Bearer + settings.manage · 200 · 401 · 403
   */
  listPrompts: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listPrompts(req.ctx);
    newSuccessResponse(req, res, 200, 'prompts fetched', aiPromptListResponse(list));
  };

  /**
   * setPrompt нь нэг давхаргын (scope | instructions) агуулгыг солино.
   * Өөрчлөлт нэн даруй үйлчилнэ (prompt кэш хүчингүй болдог).
   *
   * PUT /admin/ai/prompts/:key · Bearer + settings.manage · 200 · 400 · 401 · 403 · 422
   */
  setPrompt: AsyncHandler = async (req, res) => {
    const key = pathParam(req, 'key');
    const body = decodeBody(req, promptUpdateSchema);
    await this.usecase.setPrompt(req.ctx, key, body.content);
    newSuccessResponse(req, res, 200, 'prompt updated');
  };
}

export const newAIHandler = (usecase: AIUsecase): AIHandler => new AIHandler(usecase);
