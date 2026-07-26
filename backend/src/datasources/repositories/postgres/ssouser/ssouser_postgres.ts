// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// SSO (OIDC)-ээр нэвтэрсэн иргэнийг pairwise subject (sso_sub) эсвэл иргэний
// дугаар (civil_id)-ээр users хүснэгтэд upsert хийнэ.
//
// eID upsert-ийн адил "service" RLS контекст дор ажиллана — SSO callback нь
// нэвтрэхээс ӨМНӨХ урсгал тул хэрэглэгчийн identity хараахан байхгүй.
//
// ХАМГИЙН чухал зорилго нь ДАВХАРДАЛ ҮҮСГЭХГҮЙ байх: нэг иргэн eID-ээр болон
// SSO-ээр нэвтрэхэд НЭГ данс байх ёстой. Тиймээс upsertByCivilID нь гурван
// шатлалтай (доорх тайлбарыг үз).

import { internalCause } from '../../../../apperror/index.js';
import { userRecordToDomain, UserColumns, type UsersRecord } from '../../../records/users.js';
import type { User } from '../../../../domain/users.js';
import { withService, type Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db, Queryable } from '../../../drivers/pg.js';
import type { SSOUserInput, SSOUserRepository } from '../../interface/sso.js';

class SSOUserPostgres implements SSOUserRepository {
  constructor(private readonly db: Db) {}

  async upsertBySSOSub(ctx: Ctx, ssoSub: string, input: SSOUserInput): Promise<User> {
    try {
      return await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query<UsersRecord>(
          `INSERT INTO users(id, username, first_name, last_name, first_name_en, last_name_en,
                             email, password, active, role_id, sso_sub,
                             google_sub, google_email, google_name, google_picture, created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NULL, true, $7, $8,
                   NULLIF($9,''), NULLIF($10,''), NULLIF($11,''), NULLIF($12,''), now())
           ON CONFLICT (sso_sub) WHERE sso_sub IS NOT NULL
           DO UPDATE SET
               first_name     = EXCLUDED.first_name,
               last_name      = EXCLUDED.last_name,
               first_name_en  = EXCLUDED.first_name_en,
               last_name_en   = EXCLUDED.last_name_en,
               google_sub     = COALESCE(EXCLUDED.google_sub, users.google_sub),
               google_email   = COALESCE(EXCLUDED.google_email, users.google_email),
               google_name    = COALESCE(EXCLUDED.google_name, users.google_name),
               google_picture = COALESCE(EXCLUDED.google_picture, users.google_picture),
               active         = true,
               updated_at     = now()
           RETURNING ${UserColumns}`,
          [
            input.username,
            input.firstName,
            input.lastName,
            input.firstNameEn,
            input.lastNameEn,
            input.email,
            input.roleId,
            ssoSub,
            input.googleSub,
            input.googleEmail,
            input.googleName,
            input.googlePicture,
          ],
        );
        const row = res.rows[0];
        if (!row) throw new Error('sso upsert succeeded but RETURNING produced no row');
        return userRecordToDomain(row);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async upsertByCivilID(
    ctx: Ctx,
    civilId: string,
    nationalId: string,
    ssoSub: string,
    input: SSOUserInput,
  ): Promise<User> {
    try {
      return await this.db.withRLS(withService(ctx), async (tx) => {
        // ① Админаас урьдчилан бүртгэсэн мөр (national_id-тай, гэхдээ civil_id/
        //    sso_sub-ГҮЙ) байвал ЭНЭ нэвтрэлтэд холбоно. Private платформд админ
        //    иргэнийг регистрээр урьдчилан бүртгэдэг тул иргэн эхлээд SSO-оор
        //    нэвтрэхэд тэр мөрийг олж залгана — шинэ давхардсан мөр үүсгэхгүй.
        //    role_id/email ХӨНДӨХГҮЙ (админы оноосон эрх хэвээр).
        if (nationalId !== '') {
          const promoted = await this.promoteByNationalId(tx, civilId, nationalId, ssoSub, input);
          if (promoted) return promoted;
        }

        // ② civil_id-ГҮЙ байсан ПАЙРВАЙЗ (sso_sub) мөр байвал түүнд civil_id/
        //    national_id-ыг нэмж "дэвшүүлнэ". Ингэснээр иргэн урьд SSO-гоор
        //    nationalid scope-ГҮЙ нэвтэрч (sso_sub мөр үүсгээд) дараа nationalid-
        //    тай эргэж ирэхэд ③ дэх INSERT нь sso_sub давхцалд мөргөлдөхгүй.
        const promotedSub = await this.promoteBySSOSub(tx, civilId, nationalId, ssoSub, input);
        if (promotedSub) return promotedSub;

        // ③ Пайрвайз мөр байхгүй — civil_id-ээр INSERT/merge (шинэ иргэн эсвэл
        //    eID-ээр урьд бүртгэгдсэн мөртэй нэгтгэх).
        const res = await tx.query<UsersRecord>(
          `INSERT INTO users(id, username, first_name, last_name, first_name_en, last_name_en,
                             email, password, active, role_id, national_id, civil_id, sso_sub,
                             google_sub, google_email, google_name, google_picture, created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NULL, NULL, true, $6, $7, $8, $9,
                   NULLIF($10,''), NULLIF($11,''), NULLIF($12,''), NULLIF($13,''), now())
           ON CONFLICT (lower(civil_id)) WHERE civil_id IS NOT NULL
           DO UPDATE SET
               sso_sub        = EXCLUDED.sso_sub,
               first_name     = COALESCE(NULLIF(EXCLUDED.first_name, ''), users.first_name),
               last_name      = COALESCE(NULLIF(EXCLUDED.last_name, ''), users.last_name),
               first_name_en  = COALESCE(NULLIF(EXCLUDED.first_name_en, ''), users.first_name_en),
               last_name_en   = COALESCE(NULLIF(EXCLUDED.last_name_en, ''), users.last_name_en),
               google_sub     = COALESCE(EXCLUDED.google_sub, users.google_sub),
               google_email   = COALESCE(EXCLUDED.google_email, users.google_email),
               google_name    = COALESCE(EXCLUDED.google_name, users.google_name),
               google_picture = COALESCE(EXCLUDED.google_picture, users.google_picture),
               active         = true,
               updated_at     = now()
           RETURNING ${UserColumns}`,
          [
            input.username,
            input.firstName,
            input.lastName,
            input.firstNameEn,
            input.lastNameEn,
            input.roleId,
            nationalId,
            civilId,
            ssoSub,
            input.googleSub,
            input.googleEmail,
            input.googleName,
            input.googlePicture,
          ],
        );
        const row = res.rows[0];
        if (!row) throw new Error('sso civil upsert succeeded but RETURNING produced no row');
        return userRecordToDomain(row);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /** promoteByNationalId нь ① шатыг гүйцэтгэнэ (админаас бүртгэсэн мөрийг холбох). */
  private async promoteByNationalId(
    tx: Queryable,
    civilId: string,
    nationalId: string,
    ssoSub: string,
    input: SSOUserInput,
  ): Promise<User | null> {
    const res = await tx.query<UsersRecord>(
      `UPDATE users SET
           civil_id       = $2,
           sso_sub        = $3,
           first_name     = COALESCE(NULLIF($4,''), first_name),
           last_name      = COALESCE(NULLIF($5,''), last_name),
           first_name_en  = COALESCE(NULLIF($6,''), first_name_en),
           last_name_en   = COALESCE(NULLIF($7,''), last_name_en),
           active         = true,
           updated_at     = now()
         WHERE lower(national_id) = lower($1)
           AND (civil_id IS NULL OR civil_id = '')
           AND (sso_sub  IS NULL OR sso_sub  = '')
         RETURNING ${UserColumns}`,
      [
        nationalId,
        civilId,
        ssoSub,
        input.firstName,
        input.lastName,
        input.firstNameEn,
        input.lastNameEn,
      ],
    );
    // ЯГ нэг мөр таарсан үед л дэвшүүлнэ — олон мөр таарвал аль нь болохыг
    // мэдэхгүй тул доод шатлал руу шилжинэ.
    return res.rows.length === 1 ? userRecordToDomain(res.rows[0]!) : null;
  }

  /** promoteBySSOSub нь ② шатыг гүйцэтгэнэ (пайрвайз мөрд дугаар нэмэх). */
  private async promoteBySSOSub(
    tx: Queryable,
    civilId: string,
    nationalId: string,
    ssoSub: string,
    input: SSOUserInput,
  ): Promise<User | null> {
    const res = await tx.query<UsersRecord>(
      `UPDATE users SET
           civil_id       = $2,
           national_id    = $3,
           first_name     = COALESCE(NULLIF($4,''), first_name),
           last_name      = COALESCE(NULLIF($5,''), last_name),
           first_name_en  = COALESCE(NULLIF($6,''), first_name_en),
           last_name_en   = COALESCE(NULLIF($7,''), last_name_en),
           google_sub     = COALESCE(NULLIF($8,''), google_sub),
           google_email   = COALESCE(NULLIF($9,''), google_email),
           google_name    = COALESCE(NULLIF($10,''), google_name),
           google_picture = COALESCE(NULLIF($11,''), google_picture),
           active         = true,
           updated_at     = now()
         WHERE sso_sub = $1 AND (civil_id IS NULL OR civil_id = '')
         RETURNING ${UserColumns}`,
      [
        ssoSub,
        civilId,
        nationalId,
        input.firstName,
        input.lastName,
        input.firstNameEn,
        input.lastNameEn,
        input.googleSub,
        input.googleEmail,
        input.googleName,
        input.googlePicture,
      ],
    );
    return res.rows.length === 1 ? userRecordToDomain(res.rows[0]!) : null;
  }

  /**
   * authorizedByCivilOrNational нь private платформын шалгуур: өгсөн civil_id
   * ЭСВЭЛ national_id-аар тохирох (устгаагүй) хэрэглэгч байвал true.
   */
  async authorizedByCivilOrNational(
    ctx: Ctx,
    civilId: string,
    nationalId: string,
  ): Promise<boolean> {
    try {
      return await this.db.withRLS(withService(ctx), async (tx) => {
        const res = await tx.query<{ exists: boolean }>(
          `SELECT EXISTS(
             SELECT 1 FROM users
              WHERE deleted_at IS NULL
                AND (
                  ($1 <> '' AND lower(civil_id)    = lower($1)) OR
                  ($2 <> '' AND lower(national_id) = lower($2))
                )
           ) AS exists`,
          [civilId, nationalId],
        );
        return res.rows[0]?.exists ?? false;
      });
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newSSOUserRepository = (db: Db): SSOUserRepository => new SSOUserPostgres(db);
