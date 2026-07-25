// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Express-ийн Request дээр энэ апп-ын нэмэлт талбаруудыг ил тодорхойлно. Go
// хувилбар нь эдгээрийг context.Context-д зөөдөг; Node дээр хүсэлтийн объект нь
// тэр зөөгчийн үүрэг гүйцэтгэнэ.

import type { Request, Response, NextFunction } from 'express';

import type { Ctx, CurrentUser } from '../pkg/ctx/ctx.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** ctx нь RLS identity, requestId болон цуцлалтыг зөөвөрлөнө. */
      ctx: Ctx;
      /** currentUser нь auth middleware тавьдаг баталгаажсан хэрэглэгч. */
      currentUser?: CurrentUser;
      /** clientIp нь trusted-proxy-aware байдлаар тодорхойлсон клиентийн IP. */
      clientIp?: string;
      /** rawBody нь webhook гарын үсэг шалгахад хэрэгтэй түүхий body. */
      rawBody?: Buffer;
    }
  }
}

/** ExpressHandler нь Express-ийн стандарт handler-ийн товчлол. */
export type ExpressHandler = (req: Request, res: Response, next: NextFunction) => void;

/** Middleware нь Express-ийн middleware-ийн товчлол. */
export type Middleware = ExpressHandler;

/**
 * AsyncHandler нь алдаа шиддэг (эсвэл reject хийдэг) handler юм — wrap нь түүнийг
 * нэгдсэн дугтуйгаар хариулдаг Express handler болгоно.
 */
export type AsyncHandler = (req: Request, res: Response) => Promise<void> | void;

export type { Request, Response, NextFunction };
