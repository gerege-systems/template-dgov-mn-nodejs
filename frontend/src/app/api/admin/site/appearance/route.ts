import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// Backend-ийн domain_site.go валидацитай нэг мөр байх ёстой.
const PRESETS = new Set(['cobalt', 'teal', 'violet', 'emerald', 'amber']);
const FONTS = new Set(['inter', 'serif', 'system']);
const STYLES = new Set(['comfortable', 'compact']);
const THEMES = new Set(['light', 'dark', 'system']);
const HEX = /^#[0-9a-fA-F]{6}$/;

// PUT /api/admin/site/appearance — админ (settings.manage) сайтын харагдацыг
// шинэчилнэ. checkOrigin (CSRF) → утга шалгах → токентой proxy.
export async function PUT(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { accent, font, style, theme } = await readJson<{
    accent?: unknown;
    font?: unknown;
    style?: unknown;
    theme?: unknown;
  }>(req);

  const okAccent = typeof accent === 'string' && (PRESETS.has(accent) || HEX.test(accent));
  if (
    !okAccent ||
    typeof font !== 'string' || !FONTS.has(font) ||
    typeof style !== 'string' || !STYLES.has(style) ||
    typeof theme !== 'string' || !THEMES.has(theme)
  ) {
    return NextResponse.json({ ok: false, status: 400, message: 'Буруу утга.' }, { status: 400 });
  }

  // Backend admin PUT нь /v1/site/appearance-д бүртгэлтэй (route_site.go,
  // auth + settings.manage middleware-тэй). /admin/site/appearance гэж дуудвал
  // /v1/admin бүлгийн auth middleware-т орж 404/401 өгдөг тул зөв замаар нь.
  return proxyResult(
    await authedFetch('/site/appearance', {
      method: 'PUT',
      body: JSON.stringify({ accent, font, style, theme }),
    }),
  );
}
