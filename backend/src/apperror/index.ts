// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// apperror нь business давхарга HTTP handler руу дамжуулдаг төрөлжсөн алдааны
// бүрхүүлийн (envelope) албан ёсны байршил юм. HTTP давхарга нь Type бүрийг
// статус код руу буулгадаг; usecase-ууд дотоод мэдээллийг клиент рүү алдалгүйгээр
// логдох зорилгоор cause-ийг хавсаргадаг.

/** ErrorType нь domain алдааны ангиллыг илэрхийлнэ. */
export enum ErrorType {
  Internal = 0,
  NotFound = 1,
  Unauthorized = 2,
  Forbidden = 3,
  Conflict = 4,
  BadRequest = 5,
}

/**
 * DomainError нь business давхаргад дамждаг төрөлжсөн алдаа юм. cause нь анхны
 * алдааг хадгалдаг тул шалтгааны текстийг клиентийн хариу руу алдалгүйгээр
 * логдож болно.
 */
export class DomainError extends Error {
  readonly type: ErrorType;
  override readonly cause?: unknown;

  constructor(type: ErrorType, message: string, cause?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.type = type;
    this.cause = cause;
  }
}

export function newError(type: ErrorType, message: string): DomainError {
  return new DomainError(type, message);
}

/**
 * wrap нь одоо байгаа DomainError-ийн мессежийг өөрчлөхгүйгээр түүнд доод
 * түвшний cause-ийг хавсаргана. Шинэ утга буцаана (оролтыг өөрчлөхгүй).
 */
export function wrap(err: DomainError | null | undefined, cause: unknown): DomainError | null {
  if (!err) return null;
  return new DomainError(err.type, err.message, cause);
}

// Түгээмэл domain алдаануудад зориулсан хялбар constructor-ууд.

export const notFound = (msg: string) => new DomainError(ErrorType.NotFound, msg);
export const unauthorized = (msg: string) => new DomainError(ErrorType.Unauthorized, msg);
export const forbidden = (msg: string) => new DomainError(ErrorType.Forbidden, msg);
export const conflict = (msg: string) => new DomainError(ErrorType.Conflict, msg);
export const badRequest = (msg: string) => new DomainError(ErrorType.BadRequest, msg);
export const internal = (msg: string) => new DomainError(ErrorType.Internal, msg);

/**
 * asDomainError нь алдааны гинжийг (cause-аар) уруудаж эхний DomainError-ийг
 * олно — Go-ийн errors.As-ийн эквивалент.
 */
export function asDomainError(err: unknown): DomainError | null {
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 16; depth += 1) {
    if (cur instanceof DomainError) return cur;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

/** is нь алдааны гинжин дэх DomainError тухайн төрлийнх эсэхийг шалгана. */
export function is(err: unknown, t: ErrorType): boolean {
  const d = asDomainError(err);
  return d !== null && d.type === t;
}

/** isNotFound нь "байхгүй бол алгас" хэлбэрийн идемпотент урсгалуудын товчлол. */
export function isNotFound(err: unknown): boolean {
  return is(err, ErrorType.NotFound);
}

/**
 * internalCause нь тогтсон, ерөнхий, хэрэглэгчид харагдах мессежтэй дотоод алдаа
 * үүсгэж, бодит cause-ийг логдох зорилгоор хадгална. Доод түвшний алдаа 500 хариу
 * болж хувирах байсан газар бүрд үүнийг ашигла — дотоод/library-ийн мессеж клиент
 * рүү алдагдах ёсгүй.
 */
export function internalCause(cause: unknown): DomainError {
  return new DomainError(ErrorType.Internal, 'internal server error', cause);
}
