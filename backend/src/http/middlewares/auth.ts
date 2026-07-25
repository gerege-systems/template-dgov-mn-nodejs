// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { isCacheMiss, type RedisCache } from '../../datasources/caches/redis.js';
import { withAdmin, withUser, type CurrentUser } from '../../pkg/ctx/ctx.js';
import type { JWTService } from '../../pkg/jwt/jwt.js';
import * as logger from '../../pkg/logger/logger.js';
import { accessDenyKey, tokenCutoffKey } from '../../usecases/auth/redis_keys.js';
import { newAbortResponse, newErrorResponse } from '../response.js';
import type { Middleware } from '../types.js';

const middlewareName = 'AuthMiddleware';
const fileName = 'middlewares/auth.ts';

/**
 * newAuthMiddleware нь Bearer токеныг баталгаажуулж, нууц үг солих (rotation)
 * хязгаарыг хүндэтгэж, задлан шинжилсэн claim-уудыг хүсэлтийн ctx-д хадгалдаг
 * middleware буцаана. Хариуг буцааж 401-ээр богино холбодог (гинжийг таслах арга
 * барил — алдаа дээр next-г дуудахгүй).
 */
export function newAuthMiddleware(
  jwtService: JWTService,
  redisCache: RedisCache | null,
  isAdminRoute: boolean,
): Middleware {
  return (req, res, next) => {
    void (async () => {
      const path = req.path;

      const authHeader = req.get('authorization') ?? '';
      if (authHeader === '') {
        logger.warnWithContext(req.ctx, 'Auth: missing Authorization header', {
          middleware: middlewareName,
          file: fileName,
          step: 'read_header',
          path,
        });
        newAbortResponse(req, res, 'missing authorization header');
        return;
      }

      const headerParts = authHeader.split(' ');
      if (headerParts.length !== 2) {
        logger.warnWithContext(req.ctx, 'Auth: invalid Authorization header format', {
          middleware: middlewareName,
          file: fileName,
          step: 'parse_header',
          path,
        });
        newAbortResponse(req, res, 'invalid header format');
        return;
      }

      if (headerParts[0] !== 'Bearer') {
        logger.warnWithContext(req.ctx, 'Auth: non-Bearer scheme', {
          middleware: middlewareName,
          file: fileName,
          step: 'scheme_check',
          path,
          scheme: headerParts[0],
        });
        newAbortResponse(req, res, 'token must content bearer');
        return;
      }

      let user;
      try {
        user = jwtService.parseToken(headerParts[1] ?? '');
      } catch (err) {
        logger.warnWithContext(req.ctx, 'Auth: token parse failed', {
          middleware: middlewareName,
          file: fileName,
          step: 'parse_token',
          path,
          error: logger.errText(err),
        });
        newAbortResponse(req, res, 'invalid token');
        return;
      }

      // Logout хийсэн access токеныг (deny-list) татгалз. Logout нь jti-г токены
      // үлдсэн амьдрах хугацаагаар Redis-д бичдэг; miss нь logout хийгдээгүй
      // гэсэн үг. FAIL-CLOSED: Redis-ийн жинхэнэ алдаа (miss биш) үед
      // revocation-ийг шалгаж чадахгүй тул болзошгүй татгалзсан токеныг
      // нэвтрүүлэлгүй 503 буцаана — refresh урсгал аль хэдийн fail-closed тул
      // нийцтэй.
      if (redisCache !== null && user.jti !== '') {
        try {
          const denied = await redisCache.get(req.ctx, accessDenyKey(user.jti));
          if (denied !== '') {
            logger.warnWithContext(req.ctx, 'Auth: access token denied by logout', {
              middleware: middlewareName,
              file: fileName,
              step: 'check_access_deny',
              path,
              user_id: user.UserID,
            });
            newAbortResponse(req, res, 'token has been revoked');
            return;
          }
        } catch (err) {
          if (!isCacheMiss(err)) {
            logger.errorWithContext(req.ctx, 'Auth: revocation check unavailable (fail-closed)', {
              middleware: middlewareName,
              file: fileName,
              step: 'check_access_deny',
              path,
              error: logger.errText(err),
            });
            newErrorResponse(req, res, 503, 'session verification temporarily unavailable');
            return;
          }
        }
      }

      // Хэрэглэгчийн хамгийн сүүлийн нууц үг солихоос (rotation) өмнө олгогдсон
      // access токенуудыг татгалз. Хязгаарыг changePassword Redis руу нийтэлдэг;
      // miss нь сүүлийн үед солилт хийгдээгүй гэсэн үг тул токен нэвтэрнэ.
      // Дээрхтэй ижил FAIL-CLOSED — Redis-ийн жинхэнэ алдаа үед 503.
      if (redisCache !== null && user.iat !== 0) {
        try {
          const cutoffStr = await redisCache.get(req.ctx, tokenCutoffKey(user.UserID));
          if (cutoffStr !== '') {
            // JWT iat нь секунд хүртэл бутархайгүй болгогддог тул нууц үг
            // солихтой яг нэг секундэд олгогдсон токеныг бас татгалзахын тулд
            // <= ашиглана (хил дээрх секундын цоорхойг хаана).
            const cutoff = Number.parseInt(cutoffStr, 10);
            if (Number.isFinite(cutoff) && user.iat <= cutoff) {
              logger.warnWithContext(req.ctx, 'Auth: token revoked by password rotation', {
                middleware: middlewareName,
                file: fileName,
                step: 'check_pwd_cutoff',
                path,
                user_id: user.UserID,
                issued_at: user.iat,
                cutoff,
              });
              newAbortResponse(req, res, 'token has been revoked');
              return;
            }
          }
        } catch (err) {
          if (!isCacheMiss(err)) {
            logger.errorWithContext(
              req.ctx,
              'Auth: rotation-cutoff check unavailable (fail-closed)',
              {
                middleware: middlewareName,
                file: fileName,
                step: 'check_pwd_cutoff',
                path,
                error: logger.errText(err),
              },
            );
            newErrorResponse(req, res, 503, 'session verification temporarily unavailable');
            return;
          }
        }
      }

      if (user.IsAdmin !== isAdminRoute && !user.IsAdmin) {
        logger.warnWithContext(req.ctx, 'Auth: insufficient privilege', {
          middleware: middlewareName,
          file: fileName,
          step: 'privilege_check',
          path,
          user_id: user.UserID,
          required_admin: isAdminRoute,
          user_is_admin: user.IsAdmin,
        });
        newAbortResponse(req, res, "you don't have access for this action");
        return;
      }

      const currentUser: CurrentUser = {
        id: user.UserID,
        email: user.Email,
        isAdmin: user.IsAdmin,
        roleId: user.RoleID,
        jti: user.jti,
      };
      req.currentUser = currentUser;
      // RLS: баталгаажсан хэрэглэгчийн identity-г DB давхаргад дамжуулна. Admin
      // бол бүх мөр; энгийн хэрэглэгч зөвхөн өөрийн мөр (Postgres Row-Level
      // Security бодлогоор хэрэгжинэ).
      req.ctx = { ...req.ctx, user: currentUser };
      req.ctx = user.IsAdmin ? withAdmin(req.ctx, user.UserID) : withUser(req.ctx, user.UserID);

      next();
    })();
  };
}

/**
 * currentUserFromRequest нь хүсэлтээс баталгаажуулагдсан хэрэглэгчийг гаргаж
 * авна. Танигдах claim байхгүй үед null буцаана; тийм тохиолдолд handler-ууд
 * 401-ээр хариулах ёстой.
 */
export function currentUserFromRequest(req: { currentUser?: CurrentUser }): CurrentUser | null {
  return req.currentUser ?? null;
}
