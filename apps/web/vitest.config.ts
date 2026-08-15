import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [REPO_ROOT] },
  },
  test: {
    environment: 'jsdom',
    fileParallelism: true,
    include: ['test/**/*.test.{ts,tsx}'],
    maxWorkers: 2,
    pool: 'forks',
    restoreMocks: true,
    testTimeout: 15_000,
    setupFiles: ['./test/setup.ts'],
  },
});
