// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// validators нь DTO-ийн баталгаажуулалтын цорын ганц гарц юм. Go template нь
// struct tag (go-playground/validator) ашигладаг; Node дээр түүнтэй ижил гэрээг
// zod схемээр илэрхийлж, талбар тус бүрийн алдааны БҮТЦИЙГ (field/tag/message)
// яг хэвээр хадгалав — клиент нь DTO-ийн json түлхүүрээр алдааг тааруулсаар байна.

import { z, type ZodIssue, type ZodType } from 'zod';

/**
 * FieldError нь бүтэлгүй болсон нэг баталгаажуулалтын дүрмийг тодорхойлно. API
 * хариунд буцаагдах бөгөөд ингэснээр клиент тэгш (flat) тэмдэгт мөр задлан
 * уншихгүйгээр аль талбар буруу байгааг мэдэх боломжтой.
 */
export interface FieldError {
  field: string;
  tag: string;
  message: string;
}

/**
 * ValidationErrors нь validatePayloads-ийн шиддэг бүтэцлэгдсэн бүтэлгүйтлийн
 * утга юм. Error-ээс удамшдаг тул алдаа шидэх хэвшмэл бичлэгтэй зохицдог;
 * handler-ууд instanceof шалгаж талбар тус бүрийн дэлгэрэнгүйг дүрсэлж болно.
 */
export class ValidationErrors extends Error {
  readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    super(
      errors.length === 0
        ? 'validation failed'
        : errors.map((e) => `${e.field}: ${e.message}`).join('; '),
    );
    this.name = 'ValidationErrors';
    this.errors = errors;
  }
}

const mapHelper: Record<string, string> = {
  required: 'is a required field',
  email: 'is not a valid email address',
  lowercase: 'must contain at least one lowercase letter',
  uppercase: 'must contain at least one uppercase letter',
  numeric: 'must contain at least one digit',
  strongpassword: 'must contain uppercase, lowercase, digit, and special character',
};

/** tagFor нь zod-ийн issue-г Go validator-ийн tag нэр болгон буулгана. */
function tagFor(issue: ZodIssue): string {
  // Тодорхой дүрмүүд өөрсдийн tag-ийг custom message-ээр зөөдөг (доорх
  // rule() туслахыг үз).
  if (
    issue.code === 'custom' &&
    typeof issue.message === 'string' &&
    issue.message.startsWith('@')
  ) {
    return issue.message.slice(1);
  }
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'required' : 'type';
    case 'too_small':
      return 'min';
    case 'too_big':
      return 'max';
    case 'invalid_string':
      return issue.validation === 'email' ? 'email' : 'string';
    case 'unrecognized_keys':
      return 'unknown_field';
    default:
      return issue.code;
  }
}

/** messageFor нь хүн уншихад ойлгомжтой мессежийг үүсгэнэ (Go хувилбартай ижил). */
function messageFor(issue: ZodIssue, tag: string): string {
  switch (tag) {
    case 'min':
      return issue.code === 'too_small'
        ? `must be at least ${String(issue.minimum)} characters long`
        : 'failed min validation';
    case 'max':
      return issue.code === 'too_big'
        ? `must be less than ${String(issue.maximum)} characters`
        : 'failed max validation';
    case 'unknown_field':
      return 'is not a recognized field';
    default:
      break;
  }
  const known = mapHelper[tag];
  if (known) return known;
  if (issue.message && !issue.message.startsWith('@')) return issue.message;
  return `failed validation on "${tag}"`;
}

/** pathOf нь issue-ийн замыг DTO-ийн json түлхүүр болгон нэгтгэнэ. */
function pathOf(issue: ZodIssue): string {
  if (issue.path.length === 0) {
    return issue.code === 'unrecognized_keys' && 'keys' in issue
      ? String((issue as { keys: string[] }).keys[0] ?? 'body')
      : 'body';
  }
  return issue.path.join('.');
}

/**
 * validatePayloads нь схемийг ажиллуулж, амжилттай үед задлан уншсан (parsed)
 * утгыг буцаана. Бүтэлгүй үед бүтэлгүй болсон талбар тус бүрт нэг бичлэгтэй
 * ValidationErrors-г ШИДНЭ.
 */
export function validatePayloads<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  const errors: FieldError[] = result.error.issues.map((issue) => {
    const tag = tagFor(issue);
    return { field: pathOf(issue), tag, message: messageFor(issue, tag) };
  });
  throw new ValidationErrors(errors);
}

/**
 * rule нь тухайн шалгалт бүтэлгүй болбол Go-ийн tag нэрийг зөөх custom дүрэм
 * үүсгэнэ ("@lowercase" гэх мэт), tagFor нь түүнийг эргүүлэн уншина.
 */
export function rule<T>(tag: string, check: (value: T) => boolean) {
  return (value: T, ctx: z.RefinementCtx): void => {
    if (!check(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `@${tag}` });
    }
  };
}

/**
 * strongPassword нь дор хаяж нэг том, нэг жижиг үсэг, нэг цифр болон нэг тусгай
 * тэмдэгт шаардана — Go template-ийн StrongPassword дүрэмтэй ижил.
 */
export const strongPasswordRule = rule<string>(
  'strongpassword',
  (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^a-zA-Z0-9]/.test(v),
);

/** email нь Go-ийн `email` tag-тай ижил мессежтэй email схем. */
export const email = () => z.string().email();

/** Ерөнхий бүтээцүүд — DTO схемүүд эдгээрийг дахин ашигладаг. */
export const nonEmpty = (max = 255) => z.string().min(1).max(max);
export const uuid = () => z.string().uuid();
export const strongPassword = (min = 8, max = 72) =>
  z.string().min(min).max(max).superRefine(strongPasswordRule);

/**
 * strictObject нь танихгүй талбарыг ТАТГАЛЗАНА — Go хувилбарын
 * DisallowUnknownFields-тай нийцүүлэв.
 */
export const strictObject = <S extends z.ZodRawShape>(shape: S) => z.strictObject(shape);
