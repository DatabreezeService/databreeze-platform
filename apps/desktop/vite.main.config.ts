import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/main/index.ts',
      formats: ['es'],
    },
    minify: false,
    outDir: 'dist/main',
    rollupOptions: {
      external: [/^node:/, 'electron'],
      output: { entryFileNames: 'index.js' },
    },
    sourcemap: false,
    target: 'node24',
  },
});
