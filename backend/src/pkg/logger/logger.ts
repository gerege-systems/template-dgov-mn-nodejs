// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// logger нь апп-ын бүтэцлэгдсэн JSON логийн цорын ганц гарц юм. Go template-ийн
// zap-д суурилсан logger-ийн гэрээг (Fields map + *WithContext хувилбарууд)
// pino дээр хуулбарлав — бүх лог мөр `category` талбартай, request_id-г
// context-оос автоматаар аваад залгана.

import pino, { type Logger as PinoLogger } from 'pino';

import { AppConfig } from '../../config/config.js';
import { EnvironmentDevelopment } from '../../constants/index.js';
import type { Ctx } from '../ctx/ctx.js';

/** Fields нь нэг лог мөрд залгах нэмэлт бүтэцлэгдсэн талбарууд. */
export type Fields = Record<string, unknown>;

let base: PinoLogger | null = null;

/**
 * init нь process-ийн logger-ийг тохируулна. Development орчинд хүн уншихад
 * ойлгомжтой (pretty биш ч debug түвшинтэй) байдлаар, production-д JSON-оор
 * бичнэ. Дахин дуудахад аюулгүй (идемпотент).
 */
export function init(): void {
  if (base) return;
  const isDev = AppConfig.ENVIRONMENT === EnvironmentDevelopment;
  base = pino({
    level: AppConfig.DEBUG ? 'debug' : isDev ? 'debug' : 'info',
    // Go template-ийн zap хэлбэрт нийцүүлж `ts`/`level`/`msg` гэсэн нэрсийг
    // хадгална — лог хураагч (Loki/ELK) нь тэдгээрээр parse хийдэг.
    messageKey: 'msg',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    // Нууц утга санамсаргүй логдох эрсдэлийг багасгана.
    redact: {
      paths: [
        'password',
        'token',
        'access_token',
        'refresh_token',
        'client_secret',
        'authorization',
        'secret',
      ],
      censor: '[redacted]',
    },
  });
}

function log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, fields?: Fields): void {
  if (!base) init();
  base!.child(fields ?? {})[level](msg);
}

export const debug = (msg: string, fields?: Fields): void => log('debug', msg, fields);
export const info = (msg: string, fields?: Fields): void => log('info', msg, fields);
export const warn = (msg: string, fields?: Fields): void => log('warn', msg, fields);
export const error = (msg: string, fields?: Fields): void => log('error', msg, fields);

/** withCtx нь context-ийн корреляцийн ID-г лог талбаруудад залгана. */
function withCtx(ctx: Ctx | undefined, fields?: Fields): Fields {
  const out: Fields = { ...(fields ?? {}) };
  if (ctx?.requestId) out.request_id = ctx.requestId;
  return out;
}

export const debugWithContext = (ctx: Ctx | undefined, msg: string, fields?: Fields): void =>
  log('debug', msg, withCtx(ctx, fields));
export const infoWithContext = (ctx: Ctx | undefined, msg: string, fields?: Fields): void =>
  log('info', msg, withCtx(ctx, fields));
export const warnWithContext = (ctx: Ctx | undefined, msg: string, fields?: Fields): void =>
  log('warn', msg, withCtx(ctx, fields));
export const errorWithContext = (ctx: Ctx | undefined, msg: string, fields?: Fields): void =>
  log('error', msg, withCtx(ctx, fields));

/** raw нь pino-ийн үндсэн instance-ийг илчилнэ (тест/захын тохиолдлуудад). */
export function raw(): PinoLogger {
  if (!base) init();
  return base!;
}

/** errText нь unknown алдааг лог/хариунд тохирсон мөр болгоно. */
export function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
