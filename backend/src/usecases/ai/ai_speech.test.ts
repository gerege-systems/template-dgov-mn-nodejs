// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Дуу хоолойн урсгалуудын (STT · TTS · орчуулга) unit тестүүд. Чатаас
// ялгаатай нь эдгээр нь fallback БУЦААХГҮЙ — алдаа шууд error болно; гэхдээ
// орчуулгын дуут гаралт (TTS) нь НЭМЭЛТ боломж тул унавал орчуулга үлдэнэ.

import { describe, expect, it } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { GeminiRequest, GeminiResponse, Generator } from '../../pkg/gemini/gemini.js';
import { newAIUsecase } from './ai_impl.js';
import { toWav } from './ai_speech.js';

const ctx: Ctx = background();

const textResponse = (text: string): GeminiResponse => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] } }],
});

const audioResponse = (mimeType: string, data: string): GeminiResponse => ({
  candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType, data } }] } }],
});

function recorder(
  responses: (GeminiResponse | Error)[],
): Generator & { requests: GeminiRequest[] } {
  const requests: GeminiRequest[] = [];
  let i = 0;
  return {
    requests,
    generateContent(req: GeminiRequest): Promise<GeminiResponse> {
      requests.push(structuredClone(req));
      const next = responses[Math.min(i, responses.length - 1)];
      i++;
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next ?? textResponse(''));
    },
  };
}

describe('toWav', () => {
  it('түүхий PCM-г WAV болгож base64-ээр буцаана', () => {
    const pcm = Buffer.from([0, 1, 2, 3]);
    const out = toWav({ mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') });
    expect(out.mime).toBe('audio/wav');
    const wav = Buffer.from(out.data, 'base64');
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.length).toBe(44 + pcm.length);
  });

  it('PCM биш контейнерыг БАЙГААГААР нь дамжуулна', () => {
    const out = toWav({ mimeType: 'audio/mpeg', data: 'AAAA' });
    expect(out).toEqual({ mime: 'audio/mpeg', data: 'AAAA' });
  });
});

describe('transcribe (STT)', () => {
  it('audio-г inlineData болгож илгээж, текстийг буцаана', async () => {
    const gen = recorder([textResponse('  сайн байна уу  ')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    const out = await uc.transcribe(ctx, { audio: { mime: 'audio/webm', data: 'AAAA' } });
    expect(out.text).toBe('сайн байна уу');
    expect(gen.requests[0]?.contents[0]?.parts[1]?.inlineData).toEqual({
      mimeType: 'audio/webm',
      data: 'AAAA',
    });
    // STT нь tool зарладаггүй — зөвхөн хөрвүүлэлт.
    expect(gen.requests[0]?.tools).toBeUndefined();
  });

  it('Gemini алдаа нь 500 болно (fallback БАЙХГҮЙ)', async () => {
    const gen = recorder([new Error('boom')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    await expect(
      uc.transcribe(ctx, { audio: { mime: 'audio/webm', data: 'AAAA' } }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Internal));
  });
});

describe('speak (TTS)', () => {
  it('AUDIO modality + сонгосон дуу хоолойгоор дуудаж WAV буцаана', async () => {
    const tts = recorder([audioResponse('audio/L16;codec=pcm;rate=24000', 'AAECAw==')]);
    const chat = recorder([textResponse('')]);
    const uc = newAIUsecase(chat, tts, null, [], {});
    const out = await uc.speak(ctx, { text: 'сайн уу', voice: 'Puck' });
    expect(out.mime).toBe('audio/wav');
    const cfg = tts.requests[0]?.generationConfig;
    expect(cfg?.responseModalities).toEqual(['AUDIO']);
    expect(cfg?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe('Puck');
    // Чатын client-д хүрэхгүй — TTS нь ӨӨР model.
    expect(chat.requests).toHaveLength(0);
  });

  it('voice хоосон бол тохиргооны өгөгдмөл дуу хоолой хэрэглэгдэнэ', async () => {
    const tts = recorder([audioResponse('audio/L16;codec=pcm;rate=24000', 'AAA=')]);
    const uc = newAIUsecase(tts, tts, null, [], { voice: 'Aoede' });
    await uc.speak(ctx, { text: 'x', voice: '' });
    expect(
      tts.requests[0]?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
    ).toBe('Aoede');
  });

  it('audio байхгүй хариу нь 500', async () => {
    const tts = recorder([textResponse('текст л ирлээ')]);
    const uc = newAIUsecase(tts, tts, null, [], {});
    await expect(uc.speak(ctx, { text: 'x', voice: '' })).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Internal),
    );
  });
});

describe('translate', () => {
  it('текстийг зорилтот хэлний НЭРЭЭР орчуулна', async () => {
    const gen = recorder([textResponse('Hello')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    const out = await uc.translate(ctx, {
      text: 'Сайн уу',
      targetLang: 'en',
      speak: false,
    });
    expect(out).toEqual({ sourceText: 'Сайн уу', translated: 'Hello', audio: null });
    expect(gen.requests[0]?.systemInstruction?.parts[0]?.text).toContain('English');
  });

  it('audio оролтод ЭХЛЭЭД STT, дараа нь орчуулга (2 алхам)', async () => {
    const gen = recorder([textResponse('Сайн уу'), textResponse('Hello')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    const out = await uc.translate(ctx, {
      text: '',
      audio: { mime: 'audio/webm', data: 'AAAA' },
      targetLang: 'en',
      speak: false,
    });
    expect(gen.requests).toHaveLength(2);
    expect(out.sourceText).toBe('Сайн уу');
    expect(out.translated).toBe('Hello');
  });

  it('чимээгүй chunk нь алдаа БИШ — хоосон үр дүн', async () => {
    const gen = recorder([textResponse('')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    const out = await uc.translate(ctx, {
      text: '',
      audio: { mime: 'audio/webm', data: 'AAAA' },
      targetLang: 'en',
      speak: false,
    });
    expect(out).toEqual({ sourceText: '', translated: '', audio: null });
    expect(gen.requests).toHaveLength(1);
  });

  it('текст ч audio ч байхгүй бол 400', async () => {
    const gen = recorder([textResponse('x')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    await expect(uc.translate(ctx, { text: '', targetLang: 'en', speak: false })).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.BadRequest),
    );
  });

  it('speak=true үед дуут хувилбар хавсаргана', async () => {
    const chat = recorder([textResponse('Hello')]);
    const tts = recorder([audioResponse('audio/L16;codec=pcm;rate=24000', 'AAECAw==')]);
    const uc = newAIUsecase(chat, tts, null, [], {});
    const out = await uc.translate(ctx, { text: 'Сайн уу', targetLang: 'en', speak: true });
    expect(out.audio?.mime).toBe('audio/wav');
    expect(tts.requests[0]?.contents[0]?.parts[0]?.text).toBe('Hello');
  });

  it('TTS унавал орчуулга ҮЛДЭНЭ (дуут гаралт нэмэлт боломж)', async () => {
    const chat = recorder([textResponse('Hello')]);
    const tts = recorder([new Error('tts down')]);
    const uc = newAIUsecase(chat, tts, null, [], {});
    const out = await uc.translate(ctx, { text: 'Сайн уу', targetLang: 'en', speak: true });
    expect(out.translated).toBe('Hello');
    expect(out.audio).toBeNull();
  });

  it('хоосон орчуулга нь 500 (чимээгүй бус оролт дээр)', async () => {
    const gen = recorder([textResponse('')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    await expect(
      uc.translate(ctx, { text: 'Сайн уу', targetLang: 'en', speak: false }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Internal));
  });

  it('танихгүй хэлний кодыг БАЙГААГААР нь prompt-д тавина', async () => {
    const gen = recorder([textResponse('...')]);
    const uc = newAIUsecase(gen, gen, null, [], {});
    await uc.translate(ctx, { text: 'x', targetLang: 'kk', speak: false });
    expect(gen.requests[0]?.systemInstruction?.parts[0]?.text).toContain('kk');
  });
});

describe('server time tool', () => {
  it('Улаанбаатарын цагаар огноо/цаг/бүсийг буцаана', async () => {
    const { defaultTools } = await import('./ai_tools.js');
    const tool = defaultTools()[0];
    const out = await tool?.execute(ctx, {});
    expect(out?.timezone).toBe('Asia/Ulaanbaatar');
    expect(String(out?.datetime)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
