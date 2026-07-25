// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/site нь сайтын НИЙТИЙН харагдацын default-ыг (accent · font · style ·
// theme) удирдана.
//
// getAppearance нь landing зэрэг нийтийн хуудсанд (auth-гүй) уншигддаг тул богино
// TTL кэштэй; setAppearance нь админ өөрчлөлт хийхэд кэшийг ШУУД хүчингүй болгоно.
//
// usecases/theme нь landing-ийн нэрлэсэн загваруудыг (themes) удирдана — CRUD +
// идэвхтэй (default) сонголт. Идэвхтэй theme-ийг нэвтрээгүй зочны landing уншдаг
// тул мөн богино TTL кэштэй; аливаа бичих үйлдэл кэшийг хүчингүй болгоно.

import { badRequest } from '../../apperror/index.js';
import type {
  SiteRepository,
  ThemeRepository,
} from '../../datasources/repositories/interface/site.js';
import {
  SiteFonts,
  SiteStyles,
  SiteThemes,
  validSiteAccent,
  type SiteAppearance,
} from '../../domain/site.js';
import { validateThemeConfig, type Theme } from '../../domain/theme.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';

/**
 * cacheTTLMs нь нийтийн уншилтын кэшийн нас. Landing бүр уншдаг тул богино кэш
 * DB-г хамгаална; админ өөрчлөлт кэшийг шууд цэвэрлэдэг тул хуучирсан утга
 * харагдахгүй.
 */
const cacheTTLMs = 60_000;

/** TimedCache нь нэг утгын TTL-тэй кэш (процессийн дотор). */
class TimedCache<T> {
  private value: T | undefined;
  private loadedAtMs = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(): T | undefined {
    if (this.value === undefined) return undefined;
    if (this.now() - this.loadedAtMs >= this.ttlMs) return undefined;
    return this.value;
  }

  set(v: T): void {
    this.value = v;
    this.loadedAtMs = this.now();
  }

  invalidate(): void {
    this.value = undefined;
  }
}

export interface SiteUsecase {
  /** getAppearance нь харагдацын default-ыг буцаана (кэштэй). */
  getAppearance(ctx: Ctx): Promise<SiteAppearance>;
  /** setAppearance нь харагдацын default-ыг БАТАЛГААЖУУЛААД шинэчилнэ. */
  setAppearance(ctx: Ctx, a: SiteAppearance): Promise<void>;
}

class SiteUsecaseImpl implements SiteUsecase {
  private readonly cache: TimedCache<SiteAppearance>;

  constructor(
    private readonly repo: SiteRepository,
    now?: () => number,
  ) {
    this.cache = new TimedCache<SiteAppearance>(cacheTTLMs, now);
  }

  async getAppearance(ctx: Ctx): Promise<SiteAppearance> {
    const cached = this.cache.get();
    if (cached) return cached;

    const a = await this.repo.getAppearance(ctx);
    this.cache.set(a);
    return a;
  }

  async setAppearance(ctx: Ctx, a: SiteAppearance): Promise<void> {
    // Утгын шалгалт ЭНД — DB-д зөвхөн зөвшөөрөгдсөн preset/hex л хүрнэ.
    if (!validSiteAccent(a.accent)) {
      throw badRequest('invalid accent (preset name or #rrggbb hex)');
    }
    if (!SiteFonts.has(a.font)) throw badRequest('invalid font');
    if (!SiteStyles.has(a.style)) throw badRequest('invalid style');
    if (!SiteThemes.has(a.theme)) throw badRequest('invalid theme');

    await this.repo.setAppearance(ctx, a);
    // Кэшийг хүчингүй болгоно — дараагийн уншилт DB-ээс шинэчилнэ.
    this.cache.invalidate();
  }
}

export function newSiteUsecase(repo: SiteRepository, now?: () => number): SiteUsecase {
  return new SiteUsecaseImpl(repo, now);
}

export interface ThemeUsecase {
  list(ctx: Ctx): Promise<Theme[]>;
  get(ctx: Ctx, id: string): Promise<Theme>;
  /** getActive нь идэвхтэй theme-ийг буцаана (landing, кэштэй). */
  getActive(ctx: Ctx): Promise<Theme>;
  create(ctx: Ctx, name: string, config: Record<string, unknown>): Promise<Theme>;
  update(ctx: Ctx, id: string, name: string, config: Record<string, unknown>): Promise<void>;
  deleteTheme(ctx: Ctx, id: string): Promise<void>;
  /** setActive нь тухайн theme-ийг идэвхтэй (default) болгоно. */
  setActive(ctx: Ctx, id: string): Promise<void>;
}

class ThemeUsecaseImpl implements ThemeUsecase {
  private readonly cache: TimedCache<Theme>;

  constructor(
    private readonly repo: ThemeRepository,
    now?: () => number,
  ) {
    this.cache = new TimedCache<Theme>(cacheTTLMs, now);
  }

  /** validate нь нэр болон config JSONB-ийг шалгана. */
  private validate(name: string, config: Record<string, unknown>): void {
    if (name.trim() === '') throw badRequest('theme name is required');
    if (name.length > 80) throw badRequest('theme name too long (max 80)');
    try {
      validateThemeConfig(config);
    } catch (err) {
      // domain нь хүнд уншигдах мессежтэй Error шиддэг — түүнийг 400 болгоно.
      throw badRequest(logger.errText(err));
    }
  }

  async list(ctx: Ctx): Promise<Theme[]> {
    return this.repo.listThemes(ctx);
  }

  async get(ctx: Ctx, id: string): Promise<Theme> {
    return this.repo.getTheme(ctx, id);
  }

  async getActive(ctx: Ctx): Promise<Theme> {
    const cached = this.cache.get();
    if (cached) return cached;

    const t = await this.repo.getActiveTheme(ctx);
    this.cache.set(t);
    return t;
  }

  async create(ctx: Ctx, name: string, config: Record<string, unknown>): Promise<Theme> {
    this.validate(name, config);
    return this.repo.createTheme(ctx, name.trim(), config);
  }

  async update(ctx: Ctx, id: string, name: string, config: Record<string, unknown>): Promise<void> {
    this.validate(name, config);
    await this.repo.updateTheme(ctx, id, name.trim(), config);
    // Идэвхтэй theme засагдсан байж болзошгүй тул кэшийг цэвэрлэнэ.
    this.cache.invalidate();
  }

  /**
   * deleteTheme нь ИДЭВХТЭЙ theme-ийг устгахыг хориглоно — эс бөгөөс landing
   * эх сурвалжгүй болж, нэвтрээгүй зочин хоосон хуудас харна.
   */
  async deleteTheme(ctx: Ctx, id: string): Promise<void> {
    const t = await this.repo.getTheme(ctx, id);
    if (t.isActive) {
      throw badRequest('cannot delete the active theme; activate another first');
    }
    await this.repo.deleteTheme(ctx, id);
    this.cache.invalidate();
  }

  async setActive(ctx: Ctx, id: string): Promise<void> {
    await this.repo.setActive(ctx, id);
    this.cache.invalidate();
  }
}

export function newThemeUsecase(repo: ThemeRepository, now?: () => number): ThemeUsecase {
  return new ThemeUsecaseImpl(repo, now);
}
