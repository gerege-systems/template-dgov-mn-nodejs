// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// ESLint (flat config) — төрөл-мэдлэгтэй (type-aware) дүрмүүд. Go хувилбарын
// golangci-lint gate-ийн эквивалент: ажиллах үед л мэдэгддэг байсан алдаанууд
// (await мартсан, шалгаагүй promise, unknown алдаа) CI-д баригдана.

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  // recommendedTypeChecked — бодит алдаа барих (мартсан await, шалгаагүй promise,
  // unknown алдааг мөр мэт хэрэглэх) төрөл-мэдлэгтэй дүрмүүд. strictTypeChecked-ийг
  // ЗӨВХӨН стилийн шалтгаанаар хэрэглээгүй: тэр нь void-shorthand болон
  // тодорхойлолтын дараах non-null assertion зэрэг энэ кодын хэвшлийг эсэргүүцдэг.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Promise-ийг мартаж хаях нь чимээгүй өнгөрөх алдааны эх сурвалж.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // Repository давхарга нь SQL мөрийг template literal-д барьдаг тул
      // параметрчлэгдсэн query-г "unsafe" гэж гомдохгүй байлгана.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      // Тайлбарын хэвшил: Go хувилбарт _ctx гэх мэт ашиглагдаагүй параметр байдаг.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Тестүүдэд assertion-ууд илүү сул байхыг зөвшөөрнө.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // unbound-method нь "this алдагдахаас" сэргийлэх дүрэм. Тестэд бид mock
      // функцийг `expect(repo.method)`-д ДУУДАЛГҮЙ дамжуулдаг тул `this` огт
      // хэрэглэгддэггүй — энэ нь цэвэр false positive. Зөвхөн тест файлд унтраав.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
