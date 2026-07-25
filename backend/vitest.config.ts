// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Unit тестүүд — mock-той, хурдан, Docker шаардахгүй (Go хувилбарын
// `go test ./...`-тай дүйцнэ). Testcontainers-тэй integration тестүүд
// vitest.integration.config.ts дор тусдаа ажиллана.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**', 'dist/**'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/cmd/**'],
    },
  },
});
