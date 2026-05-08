import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@wrapped/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [resolve(__dirname, 'test/setup/global.ts')],
    include: [resolve(__dirname, 'test/**/*.test.ts')],
    pool: 'threads',
    testTimeout: 30_000,
  },
});
