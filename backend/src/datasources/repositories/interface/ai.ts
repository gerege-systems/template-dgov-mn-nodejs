// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { AIKnowledge, AIPrompt } from '../../../domain/ai.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * AIRepository нь AI туслахын тохируулдаг prompt давхаргууд болон мэдлэгийн
 * санг (knowledge base) хадгалах/уншихыг хариуцна. Suurь (base) дүрэм кодод
 * хатуу бичигдсэн тул эндээс зөвхөн scope/instructions давхарга уншигдана.
 */
export interface AIRepository {
  /** listPrompts нь тохируулдаг бүх prompt давхаргыг буцаана. */
  listPrompts(ctx: Ctx): Promise<AIPrompt[]>;
  /**
   * setPrompt нь нэг давхаргын агуулгыг солино. Танигдаагүй key дээр
   * apperror.notFound шиднэ (зөвшөөрөгдсөн key-үүд migration-д seed
   * хийгддэг — INSERT хийдэггүй).
   */
  setPrompt(ctx: Ctx, key: string, content: string): Promise<void>;
  /**
   * searchKnowledge нь мэдлэгийн сангаас query-д тохирох бичлэгүүдийг
   * буцаана (title/content ILIKE + tag тэнцэл). AI-ийн search_knowledge
   * tool үүгээр ажилладаг.
   */
  searchKnowledge(ctx: Ctx, query: string, limit: number): Promise<AIKnowledge[]>;
}
