import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test/setup/global.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['test/e2e/**', 'node_modules/**'],
    pool: 'threads',
    testTimeout: 30_000,
  },
});
