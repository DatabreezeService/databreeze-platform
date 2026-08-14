import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
