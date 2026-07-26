// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// ai_prompts (тохируулдаг prompt давхаргууд) болон ai_knowledge (AI-ийн
// хайдаг мэдлэгийн сан) хүснэгтүүдийн Postgres gateway. Хоёулаа
// хэрэглэгч-тус-бүрийн биш лавлах өгөгдөл тул Row-Level Security-д
// хамаарахгүй (жирийн pool query).

import { internalCause, notFound } from '../../../../apperror/index.js';
import type { AIKnowledge, AIPrompt } from '../../../../domain/ai.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import type { AIRepository } from '../../interface/ai.js';

interface PromptRow {
  key: string;
  content: string;
  updated_at: Date | null;
}

interface KnowledgeRow {
  id: number;
  title: string;
  content: string;
  tags: string[] | null;
}

class PostgresAIRepository implements AIRepository {
  constructor(private readonly db: Db) {}

  async listPrompts(ctx: Ctx): Promise<AIPrompt[]> {
    try {
      const res = await this.db.query<PromptRow>(
        ctx,
        'SELECT key, content, updated_at FROM ai_prompts ORDER BY key',
      );
      return res.rows.map((r) => ({ key: r.key, content: r.content, updatedAt: r.updated_at }));
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * setPrompt нь зөвхөн UPDATE хийдэг — зөвшөөрөгдсөн key-үүд migration-д seed
   * хийгдсэн тул дурын шинэ давхарга нэмэгдэхгүй (prompt гадаргууг хаалттай
   * байлгана).
   */
  async setPrompt(ctx: Ctx, key: string, content: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(
        ctx,
        'UPDATE ai_prompts SET content = $2, updated_at = now() WHERE key = $1',
        [key, content],
      );
      affected = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('prompt not found');
  }

  async searchKnowledge(ctx: Ctx, query: string, limit: number): Promise<AIKnowledge[]> {
    const capped = limit <= 0 || limit > 10 ? 5 : limit;
    try {
      // ILIKE — template хэмжээнд хангалттай; том сан дээр энэ query-г
      // tsvector (full-text) эсвэл pgvector (semantic) хайлтаар солино.
      const res = await this.db.query<KnowledgeRow>(
        ctx,
        `SELECT id, title, content, tags
           FROM ai_knowledge
          WHERE title ILIKE '%' || $1 || '%'
             OR content ILIKE '%' || $1 || '%'
             OR $1 = ANY(tags)
          ORDER BY updated_at DESC NULLS LAST, id DESC
          LIMIT $2`,
        [query, capped],
      );
      return res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        tags: r.tags ?? [],
      }));
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newAIRepository = (db: Db): AIRepository => new PostgresAIRepository(db);
