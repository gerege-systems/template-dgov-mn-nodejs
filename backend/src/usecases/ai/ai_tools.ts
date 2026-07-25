// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { AIRepository } from '../../datasources/repositories/interface/ai.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { FunctionDeclaration } from '../../pkg/gemini/gemini.js';

/**
 * ToolFunc нь backend дээр ажиллах функц. Model args-ийг шийднэ, backend
 * гүйцэтгэж үр дүнг объектоор буцаана (Gemini functionResponse болж явна).
 */
export type ToolFunc = (
  ctx: Ctx,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

/**
 * ToolDef нь нэг tool = model-д зарлах тодорхойлолт + бодит гүйцэтгэл.
 * Проект бүр өөрийн tool-уудаа (DB lookup, тооцоолол г.м.) энд нэмдэг.
 */
export interface ToolDef {
  declaration: FunctionDeclaration;
  execute: ToolFunc;
}

/**
 * serverTimeTool нь серверийн одоогийн цагийг Улаанбаатарын цагаар буцаадаг
 * жишээ tool — function calling pipeline-ийг ямар ч гадаад хамааралгүйгээр
 * үзүүлэхэд хангалттай.
 */
function serverTimeTool(): ToolDef {
  return {
    declaration: {
      name: 'get_server_time',
      description:
        'Серверийн одоогийн огноо, цагийг Улаанбаатарын цагийн бүсээр буцаана. Хэрэглэгч цаг, огноо, өдрийн талаар асуувал ашигла.',
      parameters: { type: 'object', properties: {} },
    },
    execute: (_ctx, _args) => {
      const timeZone = 'Asia/Ulaanbaatar';
      const now = new Date();
      // sv-SE локал нь "YYYY-MM-DD HH:mm:ss" хэлбэрийг шууд өгдөг (Go-ийн
      // "2006-01-02 15:04:05" форматтай ижил).
      const datetime = now
        .toLocaleString('sv-SE', { timeZone, hour12: false })
        .replace('T', ' ')
        .slice(0, 19);
      const weekday = now.toLocaleString('en-US', { timeZone, weekday: 'long' });
      return Promise.resolve({ datetime, weekday, timezone: timeZone });
    },
  };
}

/**
 * defaultTools нь template-д хавсаргасан жишээ tool-ууд. Бодит проект энэ
 * жагсаалтыг өөрийн domain tool-уудаар сольж/нэмж өргөтгөнө.
 */
export const defaultTools = (): ToolDef[] => [serverTimeTool()];

/**
 * knowledgeSearchTool нь ai_knowledge хүснэгтээс хайдаг tool — AI хэрэглэгчийн
 * асуултад хариулахын өмнө мэдлэгийн сангаас (DB) мэдээлэл татаж тулгуурлана.
 * Suurь зааварт (baseInstruction) "платформын асуултад эхлээд эндээс хай"
 * гэж заасан тул AI үүнийг өөрөө дууддаг.
 */
export function knowledgeSearchTool(repo: AIRepository): ToolDef {
  return {
    declaration: {
      name: 'search_knowledge',
      description:
        'Платформын мэдлэгийн сангаас (DB) мэдээлэл хайна. Хэрэглэгчийн ' +
        'платформтой холбоотой асуултад хариулахын өмнө түлхүүр үгээр хайж, олдсон ' +
        'бичлэгүүдэд тулгуурлан хариул.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Хайх түлхүүр үг эсвэл богино хэллэг (Монголоор).',
          },
        },
        required: ['query'],
      },
    },
    execute: async (ctx, args) => {
      const query = typeof args.query === 'string' ? args.query : '';
      if (query === '') return { results: [], note: 'query хоосон байна' };
      const items = await repo.searchKnowledge(ctx, query, 5);
      const results = items.map((it) => ({ title: it.title, content: it.content }));
      return { results, count: results.length };
    },
  };
}
