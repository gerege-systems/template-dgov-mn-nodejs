// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// org_stamps хүснэгтийн Postgres gateway — байгууллагын тамганы дардасын
// зургийн URL. Мөр нь ХЭРЭГЛЭГЧИЙНХ БИШ, БАЙГУУЛЛАГЫНХ тул RLS хамаарахгүй;
// "хэн үзэж/тавьж болох" шийдвэрийг usecase давхарга eID-ээр (улсын бүртгэлийн
// төлөөллийн эрх) гаргана.

import { internalCause } from '../../../../apperror/index.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import type { OrgStampRepository } from '../../interface/orgstamp.js';

class OrgStampPostgres implements OrgStampRepository {
  constructor(private readonly db: Db) {}

  async get(ctx: Ctx, orgRegister: string): Promise<string> {
    try {
      const res = await this.db.query<{ image: string }>(
        ctx,
        `SELECT image FROM org_stamps WHERE org_register = $1`,
        [orgRegister],
      );
      // Тамга тавиагүй нь АЛДАА БИШ — хоосон мөр буцна (UI "тамга алга" гэж үзнэ).
      return res.rows[0]?.image ?? '';
    } catch (err) {
      throw internalCause(err);
    }
  }

  async upsert(ctx: Ctx, orgRegister: string, url: string, uploadedBy: string): Promise<void> {
    try {
      await this.db.query(
        ctx,
        `INSERT INTO org_stamps (org_register, image, uploaded_by, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (org_register) DO UPDATE
            SET image = EXCLUDED.image,
                uploaded_by = EXCLUDED.uploaded_by,
                updated_at = now()`,
        [orgRegister, url, uploadedBy === '' ? null : uploadedBy],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  async deleteStamp(ctx: Ctx, orgRegister: string): Promise<void> {
    try {
      await this.db.query(ctx, `DELETE FROM org_stamps WHERE org_register = $1`, [orgRegister]);
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newOrgStampRepository = (db: Db): OrgStampRepository => new OrgStampPostgres(db);
