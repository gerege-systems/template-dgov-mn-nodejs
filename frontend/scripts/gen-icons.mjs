// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Апп-ын БҮХ иконыг НЭГ эх сурвалжаас — `public/brand.webp` (лого) — үүсгэнэ.
//
// ЯАГААД СКРИПТ ВЭ: өмнө нь `favicon.ico` нь логотой огт хамаагүй placeholder
// байсан бөгөөд хэн ч анзаараагүй. Иконууд хоёртын файл тул diff дээр
// шалгагдахгүй — үүсгэх аргыг код болгосноор "лого солигдоод икон хуучирсан"
// төлөв рүү орох боломжийг арилгана. Лого солигдвол `npm run icons`.
//
// Гаралт (`public/`):
//   favicon.ico          16/32/48 — browser tab
//   apple-touch-icon.png 180 — iOS нүүр дэлгэц (ЦАГААН суурьтай, доорхыг үз)
//   icon-192.png         192 — Android / PWA
//   icon-512.png         512 — PWA splash / дэлгүүрийн жагсаалт

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const source = join(publicDir, 'brand.webp');

mkdirSync(publicDir, { recursive: true });

/** render нь логог өгөгдсөн хэмжээнд буулгаж PNG буфер буцаана. */
const render = (size, background) =>
  sharp(source)
    .resize(size, size, {
      fit: 'contain',
      // background өгөөгүй бол тунгалаг хэвээр.
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .flatten(background ? { background } : false)
    .png({ compressionLevel: 9 })
    .toBuffer();

const white = { r: 255, g: 255, b: 255, alpha: 1 };

// ── favicon.ico — олон хэмжээт. Tab дээр тунгалаг ирмэг зөв харагдана. ──
const icoSizes = [16, 32, 48];
const icoLayers = await Promise.all(icoSizes.map((s) => render(s)));
await writeFile(join(publicDir, 'favicon.ico'), await pngToIco(icoLayers));

// ── PWA икон — тунгалаг хэвээр. ──
for (const size of [192, 512]) {
  await writeFile(join(publicDir, `icon-${size}.png`), await render(size));
}

// ── apple-touch-icon — iOS нь тунгалаг хэсгийг ХАР болгодог тул цагаан дээр
//    хавсарна. Булангийн радиусыг iOS өөрөө тавина. ──
await writeFile(join(publicDir, 'apple-touch-icon.png'), await render(180, white));

console.log(`икон үүсгэлээ: favicon.ico (${icoSizes.join('/')}) · 180 · 192 · 512`);
