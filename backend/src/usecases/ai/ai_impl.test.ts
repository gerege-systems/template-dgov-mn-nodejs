// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// AI pipeline-ийн unit тестүүд. Хамгийн чухал баталгаанууд:
//   • Gemini унавал чат нь 5xx БИШ, degraded fallback мессеж буцаана;
//   • tool-уудыг BACKEND гүйцэтгэнэ, model зөвхөн сонголт хийнэ;
//   • suurь (base) заавар нь DB/env-ээс ХАМААРАХГҮЙ ҮРГЭЛЖ system prompt-д орно;
//   • prompt уншилтын DB алдаа чатыг унагахгүй (fail-open, хуучин кэшээр).

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type { AIRepository } from '../../datasources/repositories/interface/ai.js';
import type { AIKnowledge, AIPrompt } from '../../domain/ai.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { ErrGeminiNotConfigured } from '../../pkg/gemini/gemini.js';
import type { GeminiRequest, GeminiResponse, Generator } from '../../pkg/gemini/gemini.js';
import { buildContents, fallbackReply, newAIUsecase } from './ai_impl.js';
import { baseInstruction, defaultScope } from './ai_prompts.js';
import { knowledgeSearchTool } from './ai_tools.js';
import type { ToolDef } from './ai_tools.js';

const ctx: Ctx = background();

/** textResponse нь энгийн текст хариу. */
const textResponse = (text: string): GeminiResponse => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] } }],
});

/** callResponse нь function calling шийдвэр. */
const callResponse = (name: string, args: Record<string, unknown>): GeminiResponse => ({
  candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }],
});

/** fakeGenerator нь дараалсан хариунуудыг эргүүлж, хүсэлтүүдийг тэмдэглэнэ. */
function fakeGenerator(responses: (GeminiResponse | Error)[]): Generator & {
  requests: GeminiRequest[];
} {
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

/** fakeRepo нь prompt/knowledge хадгалалтын хуурамч хувилбар. */
function fakeRepo(overrides: Partial<AIRepository> = {}): AIRepository {
  return {
    listPrompts: () => Promise.resolve<AIPrompt[]>([]),
    setPrompt: () => Promise.resolve(),
    searchKnowledge: () => Promise.resolve<AIKnowledge[]>([]),
    ...overrides,
  };
}

const noTools: ToolDef[] = [];

describe('ai pipeline — чат', () => {
  it('tool дуудагдаагүй бол model-ийн текстийг шууд буцаана', async () => {
    const gen = fakeGenerator([textResponse('Сайн байна уу')]);
    const uc = newAIUsecase(gen, gen, null, noTools, {});
    const out = await uc.run(ctx, { prompt: 'сайн уу', history: [] });
    expect(out).toEqual({ reply: 'Сайн байна уу', steps: [], degraded: false });
  });

  it('function дуудлагыг BACKEND гүйцэтгэж үр дүнг model руу буцаана', async () => {
    const execute = vi.fn((_c: Ctx, _a: Record<string, unknown>) =>
      Promise.resolve<Record<string, unknown>>({ datetime: '2026-07-26 10:00:00' }),
    );
    const tool: ToolDef = {
      declaration: { name: 'get_server_time', description: 'цаг', parameters: {} },
      execute,
    };
    const gen = fakeGenerator([callResponse('get_server_time', {}), textResponse('10 цаг байна')]);
    const uc = newAIUsecase(gen, gen, null, [tool], {});

    const out = await uc.run(ctx, { prompt: 'хэдэн цаг вэ', history: [] });
    expect(execute).toHaveBeenCalledOnce();
    expect(out.reply).toBe('10 цаг байна');
    expect(out.degraded).toBe(false);
    expect(out.steps).toEqual([
      { tool: 'get_server_time', args: {}, result: { datetime: '2026-07-26 10:00:00' } },
    ]);
    // 2 дахь хүсэлтэд model-ийн ээлж + functionResponse ээлж нэмэгдсэн байх ёстой.
    const second = gen.requests[1];
    expect(second?.contents.at(-1)?.parts[0]?.functionResponse?.name).toBe('get_server_time');
    // Tool-ууд зарлагдсан байх ёстой.
    expect(second?.tools?.[0]?.functionDeclarations[0]?.name).toBe('get_server_time');
  });

  it('танихгүй tool-ыг алдаа болгож model руу буцаана (pipeline тасрахгүй)', async () => {
    const gen = fakeGenerator([callResponse('made_up', { a: 1 }), textResponse('уучлаарай')]);
    const uc = newAIUsecase(gen, gen, null, noTools, {});
    const out = await uc.run(ctx, { prompt: 'тест', history: [] });
    expect(out.steps[0]?.result).toEqual({ error: 'unknown tool "made_up"' });
    expect(out.reply).toBe('уучлаарай');
  });

  it('tool доторх алдаа нь дэлгэрэнгүйг НУУЖ ерөнхий мессеж буцаана', async () => {
    const tool: ToolDef = {
      declaration: { name: 'boom', description: 'x' },
      execute: () => Promise.reject(new Error('database password leaked in message')),
    };
    const gen = fakeGenerator([callResponse('boom', {}), textResponse('за')]);
    const uc = newAIUsecase(gen, gen, null, [tool], {});
    const out = await uc.run(ctx, { prompt: 'тест', history: [] });
    expect(out.steps[0]?.result).toEqual({ error: 'tool execution failed' });
    expect(JSON.stringify(out)).not.toContain('password');
  });

  it('Gemini түр унавал 5xx БИШ, degraded fallback буцаана', async () => {
    const gen = fakeGenerator([new Error('gemini: 3 attempts failed')]);
    const uc = newAIUsecase(gen, gen, null, noTools, {});
    const out = await uc.run(ctx, { prompt: 'сайн уу', history: [] });
    expect(out).toEqual({ reply: fallbackReply, steps: [], degraded: true });
  });

  it('түлхүүр тохируулаагүй бол ЭНЭ НЬ операторын алдаа — 500 шиднэ', async () => {
    const gen = fakeGenerator([new ErrGeminiNotConfigured()]);
    const uc = newAIUsecase(gen, gen, null, noTools, {});
    await expect(uc.run(ctx, { prompt: 'сайн уу', history: [] })).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Internal),
    );
  });

  it('хоосон хариу нь fallback болно', async () => {
    const gen = fakeGenerator([textResponse('')]);
    const uc = newAIUsecase(gen, gen, null, noTools, {});
    const out = await uc.run(ctx, { prompt: 'сайн уу', history: [] });
    expect(out.degraded).toBe(true);
    expect(out.reply).toBe(fallbackReply);
  });

  it('maxSteps хүрвэл давталт тасарч degraded болно', async () => {
    const tool: ToolDef = {
      declaration: { name: 'loop', description: 'x' },
      execute: () => Promise.resolve({}),
    };
    const gen = fakeGenerator([callResponse('loop', {})]); // ҮРГЭЛЖ tool дуудна
    const uc = newAIUsecase(gen, gen, null, [tool], { maxSteps: 2 });
    const out = await uc.run(ctx, { prompt: 'тест', history: [] });
    expect(out.degraded).toBe(true);
    expect(out.steps).toHaveLength(2);
    expect(gen.requests).toHaveLength(2);
  });
});

describe('ai pipeline — contents угсрах', () => {
  it('history-г сүүлийн 20 ээлжээр тайрна', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: 'user',
      text: `msg-${String(i)}`,
    }));
    const contents = buildContents({ prompt: 'сүүлчийн', history });
    // 20 түүх + 1 шинэ ээлж.
    expect(contents).toHaveLength(21);
    expect(contents[0]?.parts[0]?.text).toBe('msg-5');
  });

  it('танихгүй role-ыг user болгоно', () => {
    const contents = buildContents({ prompt: 'x', history: [{ role: 'system', text: 'y' }] });
    expect(contents[0]?.role).toBe('user');
  });

  it('audio-г inlineData болгож текстийн хажууд нэмнэ', () => {
    const contents = buildContents({
      prompt: 'сонс',
      audio: { mime: 'audio/webm', data: 'AAAA' },
      history: [],
    });
    const last = contents.at(-1);
    expect(last?.parts[0]?.text).toBe('сонс');
    expect(last?.parts[1]?.inlineData).toEqual({ mimeType: 'audio/webm', data: 'AAAA' });
  });
});

describe('ai pipeline — prompt давхаргууд', () => {
  const systemTextOf = (gen: { requests: GeminiRequest[] }): string =>
    gen.requests[0]?.systemInstruction?.parts[0]?.text ?? '';

  it('suurь дүрэм нь ҮРГЭЛЖ system prompt-д орно (тохируулагдахгүй)', async () => {
    const gen = fakeGenerator([textResponse('за')]);
    const uc = newAIUsecase(gen, gen, null, noTools, {});
    await uc.run(ctx, { prompt: 'x', history: [] });
    expect(systemTextOf(gen)).toContain(baseInstruction);
    expect(systemTextOf(gen)).toContain('[ХАМРАХ ХҮРЭЭ]');
  });

  it('DB-ийн scope/instructions давхарга нь prompt-д залгагдана', async () => {
    const repo = fakeRepo({
      listPrompts: () =>
        Promise.resolve([
          { key: 'scope', content: 'ЗӨВХӨН татварын асуулт', updatedAt: null },
          { key: 'instructions', content: 'Товч хариул', updatedAt: null },
        ]),
    });
    const gen = fakeGenerator([textResponse('за')]);
    const uc = newAIUsecase(gen, gen, repo, noTools, {});
    await uc.run(ctx, { prompt: 'x', history: [] });
    expect(systemTextOf(gen)).toContain('ЗӨВХӨН татварын асуулт');
    expect(systemTextOf(gen)).toContain('[НЭМЭЛТ ЗААВАР]\nТовч хариул');
  });

  it('DB хоосон бол env fallback, тэр ч байхгүй бол default', async () => {
    const genEnv = fakeGenerator([textResponse('за')]);
    await newAIUsecase(genEnv, genEnv, fakeRepo(), noTools, {
      scopePrompt: 'env хүрээ',
    }).run(ctx, { prompt: 'x', history: [] });
    expect(systemTextOf(genEnv)).toContain('env хүрээ');

    const genDefault = fakeGenerator([textResponse('за')]);
    await newAIUsecase(genDefault, genDefault, fakeRepo(), noTools, {}).run(ctx, {
      prompt: 'x',
      history: [],
    });
    expect(systemTextOf(genDefault)).toContain(defaultScope);
  });

  it('prompt уншилтын DB алдаа чатыг УНАГАХГҮЙ (fail-open)', async () => {
    const repo = fakeRepo({ listPrompts: () => Promise.reject(new Error('db down')) });
    const gen = fakeGenerator([textResponse('за')]);
    const uc = newAIUsecase(gen, gen, repo, noTools, {});
    const out = await uc.run(ctx, { prompt: 'x', history: [] });
    expect(out.reply).toBe('за');
    expect(systemTextOf(gen)).toContain(defaultScope);
  });

  it('кэш нь TTL дотор DB-г дахин уншихгүй; setPrompt түүнийг хүчингүй болгоно', async () => {
    const listPrompts = vi.fn((_c: Ctx) =>
      Promise.resolve<AIPrompt[]>([{ key: 'scope', content: 'v1', updatedAt: null }]),
    );
    const repo = fakeRepo({ listPrompts });
    const gen = fakeGenerator([textResponse('за')]);
    const uc = newAIUsecase(gen, gen, repo, noTools, {});

    await uc.run(ctx, { prompt: 'x', history: [] });
    await uc.run(ctx, { prompt: 'x', history: [] });
    expect(listPrompts).toHaveBeenCalledTimes(1);

    await uc.setPrompt(ctx, 'scope', 'v2');
    await uc.run(ctx, { prompt: 'x', history: [] });
    expect(listPrompts).toHaveBeenCalledTimes(2);
  });

  it('танихгүй prompt key нь 400 (гадаргуу хаалттай)', async () => {
    const gen = fakeGenerator([textResponse('за')]);
    const uc = newAIUsecase(gen, gen, fakeRepo(), noTools, {});
    await expect(uc.setPrompt(ctx, 'base', 'hack')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('хадгалалт тохируулаагүй бол prompt үйлдэл 500 өгнө', async () => {
    const gen = fakeGenerator([textResponse('за')]);
    const uc = newAIUsecase(gen, gen, null, noTools, {});
    await expect(uc.listPrompts(ctx)).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Internal));
  });
});

describe('ai pipeline — мэдлэгийн сангийн tool', () => {
  it('query-гээр хайж title/content-ийг л буцаана', async () => {
    const searchKnowledge = vi.fn((_c: Ctx, _q: string, _l: number) =>
      Promise.resolve<AIKnowledge[]>([
        { id: 1, title: 'Нууц үг сэргээх', content: 'алхмууд', tags: ['нууц үг'] },
      ]),
    );
    const tool = knowledgeSearchTool(fakeRepo({ searchKnowledge }));
    const out = await tool.execute(ctx, { query: 'нууц үг' });
    expect(searchKnowledge).toHaveBeenCalledWith(ctx, 'нууц үг', 5);
    expect(out).toEqual({ results: [{ title: 'Нууц үг сэргээх', content: 'алхмууд' }], count: 1 });
  });

  it('query хоосон бол DB-д хүрэхгүй', async () => {
    const searchKnowledge = vi.fn((_c: Ctx, _q: string, _l: number) =>
      Promise.resolve<AIKnowledge[]>([]),
    );
    const tool = knowledgeSearchTool(fakeRepo({ searchKnowledge }));
    expect(await tool.execute(ctx, {})).toEqual({ results: [], note: 'query хоосон байна' });
    expect(searchKnowledge).not.toHaveBeenCalled();
  });
});
