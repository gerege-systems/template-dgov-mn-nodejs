// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// ESM импортын smoke test — build хийсэн dist/ доторх МОДУЛЬ БҮРИЙГ жинхэнэ
// Node ESM loader-ээр импортолж үзнэ.
//
// Яагаад хэрэгтэй вэ: tsc болон vitest хоёулаа CommonJS хамаарлыг өөрсдийн
// interop-оор шийддэг тул `import { x } from '<cjs-package>'` нь ХОЁУЛАНД нь
// амжилттай хэвээр, гэтэл жинхэнэ Node ESM дээр "Named export not found" гэж
// АЖИЛЛАХ ҮЕД унадаг. Энэ нь ssh2-тэй яг ийм байдлаар production-ыг унагасан
// тул одооноос CI-д баригдана.

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distDir = path.resolve(import.meta.dirname, '..', 'dist');

/** walk нь dist доторх бүх .js файлыг цуглуулна. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = await walk(distDir);
// cmd/* нь entrypoint — импортлоход сервер асаах/процесс дуусгах гаж нөлөөтэй
// тул алгасна. Тэдний хамаарлууд бусад модулиудаар аль хэдийн шалгагдана.
const modules = files.filter((f) => !f.includes(`${path.sep}cmd${path.sep}`));

let failed = 0;
for (const file of modules) {
  try {
    await import(pathToFileURL(file).href);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${path.relative(distDir, file)}\n  ${err.message.split('\n')[0]}`);
  }
}

if (failed > 0) {
  console.error(`\nESM smoke: ${failed}/${modules.length} модуль импортлогдсонгүй`);
  process.exit(1);
}
console.log(`ESM smoke: ${modules.length} модуль бүгд импортлогдлоо`);
