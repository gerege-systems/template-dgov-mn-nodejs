// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// OpenAPI CLI:
//   npm run openapi            → docs/openapi.json-г дахин үүсгэнэ
//   npm run openapi -- --check → drift шалгана (CI gate; өөрчлөгдвөл exit 1)
//
// Go хувилбарын `make swag` / `make ci-swag-check` хосын эквивалент.

import fs from 'node:fs';
import path from 'node:path';

import { openapiDocument } from './document.js';

const outFile = path.resolve('docs', 'openapi.json');
const rendered = `${JSON.stringify(openapiDocument(), null, 2)}\n`;
const check = process.argv.includes('--check');

if (check) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (current !== rendered) {
    process.stderr.write(
      'OpenAPI drift: docs/openapi.json нь эх кодтой таарахгүй байна. ' +
        '`npm run openapi` ажиллуулаад гарсан файлыг commit хийнэ үү.\n',
    );
    process.exit(1);
  }
  process.stdout.write('OpenAPI up to date.\n');
} else {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, rendered);
  process.stdout.write(`wrote ${path.relative(process.cwd(), outFile)}\n`);
}
