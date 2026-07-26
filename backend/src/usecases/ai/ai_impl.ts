// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { badRequest, internal, internalCause } from '../../apperror/index.js';
import { LoggerCategory, LoggerCategoryAI } from '../../constants/index.js';
import type { AIRepository } from '../../datasources/repositories/interface/ai.js';
import { AIPromptInstructions, AIPromptKeys, AIPromptScope } from '../../domain/ai.js';
import type { AIPrompt } from '../../domain/ai.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import {
  ErrGeminiNotConfigured,
  responseFunctionCalls,
  responseInlineAudio,
  responseModelContent,
  responseText,
} from '../../pkg/gemini/gemini.js';
import type { Content, GeminiRequest, Generator, Part } from '../../pkg/gemini/gemini.js';
import * as logger from '../../pkg/logger/logger.js';
import { composeSystemInstruction, defaultScope, promptCacheTTLMs } from './ai_prompts.js';
import { langNames, sttInstruction, toWav, translateInstruction } from './ai_speech.js';
import type { ToolDef } from './ai_tools.js';
import type {
  AIUsecase,
  RunRequest,
  RunResult,
  SpeakRequest,
  SpeakResult,
  Step,
  TranscribeRequest,
  TranscribeResult,
  TranslateRequest,
  TranslateResult,
} from './ai_usecase.js';

/**
 * fallbackReply нь Gemini бүх оролдлогын дараа ч амжилтгүй үед хэрэглэгчид
 * очих Монгол мессеж — хүсэлтийг 5xx болгож унагахын оронд degraded хариу өгнө.
 */
export const fallbackReply =
  'Уучлаарай, AI үйлчилгээ түр ачаалалтай байна. Та хэсэг хугацааны дараа дахин оролдоно уу.';

const defaultMaxSteps = 4;
const maxHistoryTurns = 20;
/** defaultVoice нь Gemini TTS-ийн prebuilt дуу хоолой. */
const defaultVoice = 'Kore';

/** AIConfig нь pipeline-ийн тохируулга. */
export interface AIConfig {
  /**
   * maxSteps нь function-calling давталтын дээд тоо — model үүнээс олон
   * удаа дараалан tool дуудвал хамгийн сүүлийн текстээр (эсвэл fallback)
   * тасална. 0 бол өгөгдмөл (4).
   */
  maxSteps?: number;
  /** voice нь TTS-ийн өгөгдмөл prebuilt дуу хоолой. Хоосон бол "Kore". */
  voice?: string;
  /**
   * scopePrompt нь хамрах хүрээний env fallback (AI_SCOPE_PROMPT) — DB-ийн
   * 'scope' давхарга хоосон/уншигдахгүй үед хэрэглэгдэнэ.
   */
  scopePrompt?: string;
}

/**
 * buildContents нь history + шинэ prompt (текст ба/эсвэл audio)-оос Gemini
 * contents угсарна. History-г сүүлийн maxHistoryTurns ээлжээр тайрна
 * (token хэмнэлт).
 */
export function buildContents(req: RunRequest): Content[] {
  const history =
    req.history.length > maxHistoryTurns ? req.history.slice(-maxHistoryTurns) : req.history;
  const contents: Content[] = history.map((t) => ({
    role: t.role === 'model' ? 'model' : 'user',
    parts: [{ text: t.text }],
  }));

  const parts: Part[] = [];
  if (req.prompt !== '') parts.push({ text: req.prompt });
  if (req.audio) parts.push({ inlineData: { mimeType: req.audio.mime, data: req.audio.data } });
  contents.push({ role: 'user', parts });
  return contents;
}

class AIUsecaseImpl implements AIUsecase {
  private readonly tools = new Map<string, ToolDef>();
  private readonly declarations;
  private readonly maxSteps: number;
  private readonly voice: string;
  private readonly scopePrompt: string;

  /** promptCache нь DB prompt-уудын богино насны кэш (TTL эсвэл setPrompt-оор шинэчлэгдэнэ). */
  private promptCacheValues: Record<string, string> | null = null;
  private promptCacheFetchedAtMs = 0;

  constructor(
    private readonly client: Generator,
    /**
     * ttsClient нь TTS-чадвартай model руу заасан тусдаа client — chat
     * model audio гаргадаггүй тул хоёр өөр model хэрэглэнэ.
     */
    private readonly ttsClient: Generator,
    /**
     * repo нь тохируулдаг prompt давхаргууд + мэдлэгийн сангийн gateway.
     * null байж болно (тест) — тэр үед env/default prompt-ууд хэрэглэгдэнэ.
     */
    private readonly repo: AIRepository | null,
    tools: ToolDef[],
    cfg: AIConfig,
  ) {
    for (const t of tools) this.tools.set(t.declaration.name, t);
    this.declarations = tools.map((t) => t.declaration);
    this.maxSteps = cfg.maxSteps !== undefined && cfg.maxSteps > 0 ? cfg.maxSteps : defaultMaxSteps;
    this.voice = cfg.voice !== undefined && cfg.voice !== '' ? cfg.voice : defaultVoice;
    this.scopePrompt = cfg.scopePrompt ?? '';
  }

  // ── Чат pipeline ─────────────────────────────────────────────────────

  async run(ctx: Ctx, req: RunRequest): Promise<RunResult> {
    const geminiReq: GeminiRequest = {
      systemInstruction: { parts: [{ text: await this.systemInstruction(ctx) }] },
      contents: buildContents(req),
    };
    if (this.declarations.length > 0) {
      geminiReq.tools = [{ functionDeclarations: this.declarations }];
    }

    const steps: Step[] = [];
    for (let step = 0; step < this.maxSteps; step++) {
      let resp;
      try {
        resp = await this.client.generateContent(geminiReq, ctx.signal);
      } catch (err) {
        // Тохиргооны алдаа (түлхүүргүй) нь операторын асуудал — 500 болгож
        // log-д бодит шалтгааныг үлдээнэ.
        if (err instanceof ErrGeminiNotConfigured) throw internalCause(err);
        // Түр зуурын алдаа: retry/backoff client дотор аль хэдийн хийгдсэн —
        // одоо fallback мессежээр намжаана.
        logger.errorWithContext(ctx, 'ai pipeline: gemini failed, falling back', {
          [LoggerCategory]: LoggerCategoryAI,
          error: logger.errText(err),
          step,
        });
        return { reply: fallbackReply, steps, degraded: true };
      }

      const calls = responseFunctionCalls(resp);
      if (calls.length === 0) {
        const reply = responseText(resp);
        if (reply === '') return { reply: fallbackReply, steps, degraded: true };
        return { reply, steps, degraded: false };
      }

      // Model-ийн ээлжийг (function дуудлагуудтай нь) conversation-д нэмж,
      // tool бүрийг гүйцэтгээд үр дүнг user ээлжээр буцаана.
      geminiReq.contents.push(responseModelContent(resp));
      const responseParts: Part[] = [];
      for (const call of calls) {
        const args = call.args ?? {};
        const result = await this.executeTool(ctx, call.name, args);
        steps.push({ tool: call.name, args, result });
        responseParts.push({ functionResponse: { name: call.name, response: result } });
      }
      geminiReq.contents.push({ role: 'user', parts: responseParts });
    }

    // maxSteps хүрсэн — model дараалан tool дуудсаар тасрав.
    logger.warnWithContext(ctx, 'ai pipeline: max steps reached without final answer', {
      [LoggerCategory]: LoggerCategoryAI,
      max_steps: this.maxSteps,
    });
    return { reply: fallbackReply, steps, degraded: true };
  }

  /**
   * executeTool нь нэг function дуудлагыг гүйцэтгэнэ. Алдааг model руу
   * {"error": ...} хэлбэрээр буцаадаг — ингэснээр model хэрэглэгчид
   * ойлгомжтой тайлбар өгч чадна (pipeline тасрахгүй).
   */
  private async executeTool(
    ctx: Ctx,
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const tool = this.tools.get(name);
    if (!tool) return { error: `unknown tool "${name}"` };
    try {
      return (await tool.execute(ctx, args)) ?? {};
    } catch (err) {
      logger.errorWithContext(ctx, 'ai pipeline: tool execution failed', {
        [LoggerCategory]: LoggerCategoryAI,
        tool: name,
        error: logger.errText(err),
      });
      return { error: 'tool execution failed' };
    }
  }

  // ── Prompt давхаргууд ────────────────────────────────────────────────

  /**
   * prompts нь scope + instructions давхаргыг буцаана: DB → env fallback →
   * default. DB алдаа нь fail-open (fallback-аар үргэлжилнэ) — prompt уншилт
   * чатыг унагах ёсгүй.
   */
  private async prompts(ctx: Ctx): Promise<{ scope: string; instructions: string }> {
    const values = await this.cachedPrompts(ctx);
    let scope = (values?.[AIPromptScope] ?? '').trim();
    if (scope === '') scope = this.scopePrompt.trim();
    if (scope === '') scope = defaultScope;
    return { scope, instructions: (values?.[AIPromptInstructions] ?? '').trim() };
  }

  private async cachedPrompts(ctx: Ctx): Promise<Record<string, string> | null> {
    if (!this.repo) return null;
    if (
      this.promptCacheValues !== null &&
      Date.now() - this.promptCacheFetchedAtMs < promptCacheTTLMs
    ) {
      return this.promptCacheValues;
    }
    let list: AIPrompt[];
    try {
      list = await this.repo.listPrompts(ctx);
    } catch (err) {
      logger.errorWithContext(ctx, 'ai: failed to load prompts (using fallback)', {
        [LoggerCategory]: LoggerCategoryAI,
        error: logger.errText(err),
      });
      // Хуучирсан кэш байвал түүгээрээ үргэлжилнэ.
      return this.promptCacheValues;
    }
    const values: Record<string, string> = {};
    for (const p of list) values[p.key] = p.content;
    this.promptCacheValues = values;
    this.promptCacheFetchedAtMs = Date.now();
    return values;
  }

  /** systemInstruction нь гурван давхаргыг нэг system prompt болгож угсарна. */
  private async systemInstruction(ctx: Ctx): Promise<string> {
    const { scope, instructions } = await this.prompts(ctx);
    return composeSystemInstruction(scope, instructions);
  }

  async listPrompts(ctx: Ctx): Promise<AIPrompt[]> {
    if (!this.repo) throw internal('ai prompts storage not configured');
    return this.repo.listPrompts(ctx);
  }

  async setPrompt(ctx: Ctx, key: string, content: string): Promise<void> {
    if (!this.repo) throw internal('ai prompts storage not configured');
    if (!AIPromptKeys.includes(key)) throw badRequest('unknown prompt key');
    await this.repo.setPrompt(ctx, key, content);
    // Кэшийг хүчингүй болгож өөрчлөлтийг шууд үйлчилнэ.
    this.promptCacheValues = null;
  }

  // ── Дуу хоолой (STT · TTS · орчуулга) ────────────────────────────────

  async transcribe(ctx: Ctx, req: TranscribeRequest): Promise<TranscribeResult> {
    try {
      const resp = await this.client.generateContent(
        {
          systemInstruction: { parts: [{ text: sttInstruction }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Энэ бичлэгийг текст болго.' },
                { inlineData: { mimeType: req.audio.mime, data: req.audio.data } },
              ],
            },
          ],
        },
        ctx.signal,
      );
      return { text: responseText(resp) };
    } catch (err) {
      throw internalCause(new Error(`ai transcribe: ${logger.errText(err)}`));
    }
  }

  async speak(ctx: Ctx, req: SpeakRequest): Promise<SpeakResult> {
    const voice = req.voice === '' ? this.voice : req.voice;
    let resp;
    try {
      resp = await this.ttsClient.generateContent(
        {
          contents: [{ role: 'user', parts: [{ text: req.text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        },
        ctx.signal,
      );
    } catch (err) {
      throw internalCause(new Error(`ai speak: ${logger.errText(err)}`));
    }
    const blob = responseInlineAudio(resp);
    if (!blob) throw internalCause(new Error('ai speak: no audio in response'));
    return toWav(blob);
  }

  async translate(ctx: Ctx, req: TranslateRequest): Promise<TranslateResult> {
    let sourceText = req.text.trim();

    // Audio оролттой бол эхлээд STT — хоёр алхамт pipeline нь structured
    // output шаардахгүй тул найдвартай.
    if (sourceText === '' && req.audio) {
      const tr = await this.transcribe(ctx, { audio: req.audio });
      sourceText = tr.text.trim();
      // Яриа илрээгүй chunk (чимээгүй хэсэг) — алдаа биш, хоосон үр дүн.
      if (sourceText === '') return { sourceText: '', translated: '', audio: null };
    }
    if (sourceText === '') throw badRequest('text or audio is required');

    const target = langNames[req.targetLang.toLowerCase()] ?? req.targetLang;

    let resp;
    try {
      resp = await this.client.generateContent(
        {
          systemInstruction: { parts: [{ text: translateInstruction(target) }] },
          contents: [{ role: 'user', parts: [{ text: sourceText }] }],
        },
        ctx.signal,
      );
    } catch (err) {
      throw internalCause(new Error(`ai translate: ${logger.errText(err)}`));
    }
    const translated = responseText(resp).trim();
    if (translated === '') throw internalCause(new Error('ai translate: empty translation'));

    const result: TranslateResult = { sourceText, translated, audio: null };
    if (req.speak) {
      try {
        result.audio = await this.speak(ctx, { text: translated, voice: '' });
      } catch {
        // Дуут гаралт нэмэлт боломж — TTS унавал орчуулгаа дуугүй буцаана.
        result.audio = null;
      }
    }
    return result;
  }
}

/**
 * newAIUsecase нь AI pipeline usecase үүсгэнэ. tools нь model-д зарлагдах ба
 * backend дээр гүйцэтгэгдэх функцууд (defaultTools()-оос эхэлж болно);
 * ttsClient нь speak/translate-ийн дуут гаралтад, repo нь prompt давхарга +
 * мэдлэгийн санд хэрэглэгдэнэ.
 */
export const newAIUsecase = (
  client: Generator,
  ttsClient: Generator,
  repo: AIRepository | null,
  tools: ToolDef[],
  cfg: AIConfig,
): AIUsecase => new AIUsecaseImpl(client, ttsClient, repo, tools, cfg);
