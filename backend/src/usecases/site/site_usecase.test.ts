// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// site + theme usecase-ийн unit тестүүд. Гол зорилго: DB-д зөвхөн зөвшөөрөгдсөн
// харагдацын утга хүрэх, кэш бичилтийн дараа цэвэрлэгдэх, ИДЭВХТЭЙ theme
// устгагдахгүй байх (landing эх сурвалжгүй болно).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import type {
  SiteRepository,
  ThemeRepository,
} from '../../datasources/repositories/interface/site.js';
import { defaultSiteAppearance, type SiteAppearance } from '../../domain/site.js';
import type { Theme } from '../../domain/theme.js';
import { background, type Ctx } from '../../pkg/ctx/ctx.js';
import { newSiteUsecase, newThemeUsecase } from './site_usecase.js';

function appearance(over: Partial<SiteAppearance> = {}): SiteAppearance {
  return { ...defaultSiteAppearance(), ...over };
}

function theme(over: Partial<Theme> = {}): Theme {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Default',
    config: {},
    isActive: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: null,
    ...over,
  };
}

function mockSiteRepo(over: Partial<SiteRepository> = {}): SiteRepository {
  const no = () => Promise.reject(new Error('not stubbed'));
  return { getAppearance: vi.fn(no), setAppearance: vi.fn(no), ...over };
}

function mockThemeRepo(over: Partial<ThemeRepository> = {}): ThemeRepository {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    listThemes: vi.fn(no),
    getTheme: vi.fn(no),
    getActiveTheme: vi.fn(no),
    createTheme: vi.fn(no),
    updateTheme: vi.fn(no),
    deleteTheme: vi.fn(no),
    setActive: vi.fn(no),
    ...over,
  };
}

let ctx: Ctx;
beforeEach(() => {
  ctx = background();
});

describe('site: getAppearance кэш', () => {
  it('хоёр дахь уншилт DB-д хүрэхгүй', async () => {
    const getAppearance = vi.fn(() => Promise.resolve(appearance()));
    const uc = newSiteUsecase(mockSiteRepo({ getAppearance }));
    await uc.getAppearance(ctx);
    await uc.getAppearance(ctx);
    expect(getAppearance).toHaveBeenCalledTimes(1);
  });

  it('TTL дууссаны дараа дахин уншина', async () => {
    const getAppearance = vi.fn(() => Promise.resolve(appearance()));
    let now = 1_000_000;
    const uc = newSiteUsecase(mockSiteRepo({ getAppearance }), () => now);
    await uc.getAppearance(ctx);
    now += 61_000;
    await uc.getAppearance(ctx);
    expect(getAppearance).toHaveBeenCalledTimes(2);
  });

  it('setAppearance-ийн дараа кэш цэвэрлэгдэнэ', async () => {
    const getAppearance = vi
      .fn<() => Promise<SiteAppearance>>()
      .mockResolvedValueOnce(appearance({ accent: 'cobalt' }))
      .mockResolvedValueOnce(appearance({ accent: 'teal' }));
    const uc = newSiteUsecase(
      mockSiteRepo({ getAppearance, setAppearance: vi.fn(() => Promise.resolve()) }),
    );
    expect((await uc.getAppearance(ctx)).accent).toBe('cobalt');
    await uc.setAppearance(ctx, appearance({ accent: 'teal' }));
    expect((await uc.getAppearance(ctx)).accent).toBe('teal');
  });
});

describe('site: setAppearance валидац', () => {
  const okRepo = () => mockSiteRepo({ setAppearance: vi.fn(() => Promise.resolve()) });

  it('preset accent-ийг зөвшөөрнө', async () => {
    await expect(
      newSiteUsecase(okRepo()).setAppearance(ctx, appearance({ accent: 'violet' })),
    ).resolves.toBeUndefined();
  });

  it('#rrggbb custom hex-ийг зөвшөөрнө', async () => {
    await expect(
      newSiteUsecase(okRepo()).setAppearance(ctx, appearance({ accent: '#1A2b3C' })),
    ).resolves.toBeUndefined();
  });

  it('3-оронтой hex-ийг ТАТГАЛЗАНА (frontend 6-оронтойг л илгээдэг)', async () => {
    await expect(
      newSiteUsecase(okRepo()).setAppearance(ctx, appearance({ accent: '#abc' })),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('танихгүй preset-ийг татгалзана', async () => {
    await expect(
      newSiteUsecase(okRepo()).setAppearance(ctx, appearance({ accent: 'neon' })),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  for (const [field, value] of [
    ['font', 'comic'],
    ['style', 'roomy'],
    ['theme', 'sepia'],
  ] as const) {
    it(`танихгүй ${field}-ийг татгалзана`, async () => {
      await expect(
        newSiteUsecase(okRepo()).setAppearance(ctx, appearance({ [field]: value })),
      ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
    });
  }

  it('буруу утга DB-д ХҮРЭХГҮЙ', async () => {
    const setAppearance = vi.fn(() => Promise.resolve());
    await expect(
      newSiteUsecase(mockSiteRepo({ setAppearance })).setAppearance(
        ctx,
        appearance({ font: 'comic' }),
      ),
    ).rejects.toThrow();
    expect(setAppearance).not.toHaveBeenCalled();
  });
});

describe('theme: валидац', () => {
  const okRepo = () =>
    mockThemeRepo({ createTheme: vi.fn((_c, name: string) => Promise.resolve(theme({ name }))) });

  it('нэрийг тайрч дамжуулна', async () => {
    const createTheme = vi.fn((_c, name: string) => Promise.resolve(theme({ name })));
    await newThemeUsecase(mockThemeRepo({ createTheme })).create(ctx, '  Шинэ  ', {});
    expect(createTheme).toHaveBeenCalledWith(ctx, 'Шинэ', {});
  });

  it('хоосон нэрийг татгалзана', async () => {
    await expect(newThemeUsecase(okRepo()).create(ctx, '   ', {})).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('80-аас урт нэрийг татгалзана', async () => {
    await expect(newThemeUsecase(okRepo()).create(ctx, 'x'.repeat(81), {})).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.BadRequest),
    );
  });

  it('зөв appearance-ийг зөвшөөрнө', async () => {
    await expect(
      newThemeUsecase(okRepo()).create(ctx, 'N', {
        appearance: { mode: 'dark', font: 'serif', style: 'compact', colors: { bg: '#101418' } },
        landing: { hero: { title: 'Сайн байна уу' } },
      }),
    ).resolves.toBeDefined();
  });

  it('танихгүй appearance.mode-ийг татгалзана', async () => {
    await expect(
      newThemeUsecase(okRepo()).create(ctx, 'N', { appearance: { mode: 'sepia' } }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('танихгүй өнгөний токеныг татгалзана', async () => {
    await expect(
      newThemeUsecase(okRepo()).create(ctx, 'N', { appearance: { colors: { nope: '#ffffff' } } }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('өнгө нь #rrggbb биш бол татгалзана', async () => {
    await expect(
      newThemeUsecase(okRepo()).create(ctx, 'N', { appearance: { colors: { bg: 'red' } } }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('landing токенуудыг (lpNavy/lpHeader) зөвшөөрнө', async () => {
    await expect(
      newThemeUsecase(okRepo()).create(ctx, 'N', {
        appearance: { colors: { lpNavy: '#0b1b34', lpHeader: '#07142a' } },
      }),
    ).resolves.toBeDefined();
  });

  it('config хэт том бол татгалзана (DoS хамгаалалт)', async () => {
    const big = { landing: { blob: 'x'.repeat(130 * 1024) } };
    await expect(newThemeUsecase(okRepo()).create(ctx, 'N', big)).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });
});

describe('theme: идэвхтэй theme-ийн хамгаалалт', () => {
  it('идэвхтэй theme-ийг УСТГАХГҮЙ', async () => {
    const deleteTheme = vi.fn(() => Promise.resolve());
    const uc = newThemeUsecase(
      mockThemeRepo({
        getTheme: vi.fn(() => Promise.resolve(theme({ isActive: true }))),
        deleteTheme,
      }),
    );
    await expect(uc.deleteTheme(ctx, 'id')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
    expect(deleteTheme).not.toHaveBeenCalled();
  });

  it('идэвхгүй theme-ийг устгана', async () => {
    const deleteTheme = vi.fn(() => Promise.resolve());
    const uc = newThemeUsecase(
      mockThemeRepo({ getTheme: vi.fn(() => Promise.resolve(theme())), deleteTheme }),
    );
    await uc.deleteTheme(ctx, 'id');
    expect(deleteTheme).toHaveBeenCalledWith(ctx, 'id');
  });

  it('байхгүй theme дээр notFound-ыг ХАДГАЛНА', async () => {
    const uc = newThemeUsecase(
      mockThemeRepo({ getTheme: vi.fn(() => Promise.reject(notFound('theme not found'))) }),
    );
    await expect(uc.deleteTheme(ctx, 'id')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.NotFound),
    );
  });
});

describe('theme: getActive кэш', () => {
  it('кэшлэнэ', async () => {
    const getActiveTheme = vi.fn(() => Promise.resolve(theme({ isActive: true })));
    const uc = newThemeUsecase(mockThemeRepo({ getActiveTheme }));
    await uc.getActive(ctx);
    await uc.getActive(ctx);
    expect(getActiveTheme).toHaveBeenCalledTimes(1);
  });

  it('setActive-ийн дараа кэш цэвэрлэгдэнэ', async () => {
    const getActiveTheme = vi
      .fn<() => Promise<Theme>>()
      .mockResolvedValueOnce(theme({ id: 'a', isActive: true }))
      .mockResolvedValueOnce(theme({ id: 'b', isActive: true }));
    const uc = newThemeUsecase(
      mockThemeRepo({ getActiveTheme, setActive: vi.fn(() => Promise.resolve()) }),
    );
    expect((await uc.getActive(ctx)).id).toBe('a');
    await uc.setActive(ctx, 'b');
    expect((await uc.getActive(ctx)).id).toBe('b');
  });

  it('update-ийн дараа ч кэш цэвэрлэгдэнэ (идэвхтэйг засаж болзошгүй)', async () => {
    const getActiveTheme = vi
      .fn<() => Promise<Theme>>()
      .mockResolvedValueOnce(theme({ name: 'Хуучин', isActive: true }))
      .mockResolvedValueOnce(theme({ name: 'Шинэ', isActive: true }));
    const uc = newThemeUsecase(
      mockThemeRepo({ getActiveTheme, updateTheme: vi.fn(() => Promise.resolve()) }),
    );
    expect((await uc.getActive(ctx)).name).toBe('Хуучин');
    await uc.update(ctx, 'a', 'Шинэ', {});
    expect((await uc.getActive(ctx)).name).toBe('Шинэ');
  });

  it('идэвхтэй theme байхгүй бол notFound', async () => {
    const uc = newThemeUsecase(
      mockThemeRepo({ getActiveTheme: vi.fn(() => Promise.reject(notFound('no active theme'))) }),
    );
    await expect(uc.getActive(ctx)).rejects.toSatisfy((e: unknown) => is(e, ErrorType.NotFound));
  });
});
