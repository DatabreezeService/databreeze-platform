import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: 'dist/renderer',
    sourcemap: false,
    target: 'chrome144',
  },
  plugins: [react()],
});
