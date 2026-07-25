// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Integration тестүүд — testcontainers-ээр бодит Postgres + Redis өргөж, RLS
// бодлого, migration idempotency, repository-ийн SQL-г шалгана. Docker
// шаардлагатай тул unit тестээс тусад ажиллана (`npm run test:integration`).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    globals: false,
    // Контейнер өргөх нь хэдэн секунд авдаг.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Нэг Postgres контейнерийг файлууд хуваалцдаг тул зэрэгцүүлэхгүй.
    fileParallelism: false,
    // Домэйнууд порт хийгдэж дуустал integration тест байхгүй байж болно — тэр үед
    // команд унах ёсгүй (CI нь unit тестээр хаалга барина).
    passWithNoTests: true,
  },
});
