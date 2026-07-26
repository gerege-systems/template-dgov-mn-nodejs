// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// ctx нь Go-ийн context.Context-ийн энэ апп-д хэрэгтэй хэсгийг Node дээр
// хуулбарласан хамгийн доод түвшний (leaf) модуль юм: нэг хүсэлтийн корреляцийн
// ID, RLS identity, баталгаажсан хэрэглэгч болон цуцлалтын signal-ийг зөөвөрлөнө.
//
// Яагаад ambient (AsyncLocalStorage) биш вэ: repository давхарга ctx-ийг ил
// параметрээр авдаг нь RLS identity-г дамжуулах гэрээг компайлерийн шалгалттай
// болгож, "identity мартсан" төрлийн алдаанаас сэргийлдэг — Go хувилбарын
// зан үйлтэй мөн ижил.

/** Role нь RLS бодлогуудын уншдаг `app.user_role` GUC-ийн утга юм. */
export const Role = {
  /**
   * Service нь нэвтрэхээс ӨМНӨХ болон системийн итгэмжлэгдсэн урсгалуудад
   * (login дахь email хайлт, register дахь INSERT, OTP, нууц үг сэргээх)
   * зориулагдсан — эдгээр нь "зөвхөн өөрийн мөр" хязгаарлалтаас чөлөөлөгдөнө.
   */
  Service: 'service',
  /** Admin нь бүх мөрийг харж/өөрчилж чадна. */
  Admin: 'admin',
  /** User нь зөвхөн өөрийн (app.user_id-тэй таарах) мөрд хандана. */
  User: 'user',
  /**
   * Officer нь төрийн үйлчилгээний хүсэлт хянадаг менежер юм. Иргэний ХҮСЭЛТ,
   * ЛАВЛАГАА, МЭДЭГДЭЛ болон хүсэлтийн TIMELINE-д бүх мөрөөр хандана.
   *
   * Гэхдээ энэ нь admin БИШ: RLS бодлого нь permissive (OR) тул officer-т
   * бодлого олгоогүй хүснэгтэд тэг мөр харагдана — least-privilege, fail-closed.
   */
  Officer: 'officer',
} as const;

export type RoleValue = (typeof Role)[keyof typeof Role];

/**
 * Identity нь нэг хүсэлтийн RLS контекст юм: ямар хэрэглэгчийн нэрийн өмнөөс,
 * ямар үүрэгтэйгээр DB рүү хандаж байгаа.
 */
export interface Identity {
  /** userId нь баталгаажсан хэрэглэгчийн UUID. Service/Admin үед хоосон байж болно. */
  userId: string;
  /** role нь RLS бодлогын шийдвэрийг тодорхойлно. */
  role: RoleValue;
}

/** CurrentUser нь баталгаажуулагдсан хүсэлтийн HTTP-давхаргын дүр төрх юм. */
export interface CurrentUser {
  id: string;
  email: string;
  isAdmin: boolean;
  roleId: number;
  jti: string;
}

/** Ctx нь нэг хүсэлтийн (эсвэл background job-ийн) хүрээний контекст. */
export interface Ctx {
  /** requestId нь лог/хариу дугтуйн корреляцийн ID. */
  requestId?: string;
  /** identity нь RLS-д зориулсан "хэн" — байхгүй бол бодлогууд бүх мөрийг ХААНА. */
  identity?: Identity;
  /** user нь баталгаажсан JWT claim-аас гаргасан HTTP давхаргын дүр төрх. */
  user?: CurrentUser;
  /** signal нь клиент холболт тасрахад цуцлалт дамжуулна. */
  signal?: AbortSignal;
}

/** background нь identity-гүй, цуцлалтгүй шинэ контекст үүсгэнэ (job/boot). */
export function background(): Ctx {
  return {};
}

/** withIdentity нь Identity-г контекстэд суулгаж ШИНЭ контекст буцаана. */
export function withIdentity(ctx: Ctx, identity: Identity): Ctx {
  return { ...ctx, identity };
}

/** withService нь контекстийг Service үүргээр тэмдэглэнэ (нэвтрэхээс өмнөх урсгал). */
export function withService(ctx: Ctx): Ctx {
  return withIdentity(ctx, { userId: '', role: Role.Service });
}

/** withUser нь контекстийг тодорхой userId-тэй User үүргээр тэмдэглэнэ. */
export function withUser(ctx: Ctx, userId: string): Ctx {
  return withIdentity(ctx, { userId, role: Role.User });
}

/** withAdmin нь контекстийг Admin үүргээр тэмдэглэнэ (бүх мөрд хандана). */
export function withAdmin(ctx: Ctx, userId: string): Ctx {
  return withIdentity(ctx, { userId, role: Role.Admin });
}

/**
 * withOfficer нь контекстийн RLS үүргийг Officer болгож ӨРГӨТГӨНӨ — иргэний
 * хүсэлт хянадаг менежерт зориулсан, gov хүснэгтүүдээр хязгаарлагдсан өргөтгөл.
 */
export function withOfficer(ctx: Ctx, userId: string): Ctx {
  return withIdentity(ctx, { userId, role: Role.Officer });
}

/**
 * identityOf нь суулгасан Identity-г буцаана, эсвэл тавигдаагүй бол undefined —
 * repository нь тэр үед хоосон GUC тавьдаг тул RLS бодлого бүх мөрийг хааж,
 * аюулгүй өгөгдмөлд (fail-closed) хүрнэ.
 */
export function identityOf(ctx: Ctx): Identity | undefined {
  return ctx.identity;
}
