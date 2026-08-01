import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/security-*.test.ts', 'test/boundary-*.test.tsx'],
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
  },
});
