import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
    },
    minify: false,
    outDir: 'dist/preload',
    rollupOptions: {
      external: ['electron'],
      output: { entryFileNames: 'index.cjs' },
    },
    sourcemap: false,
    target: 'node24',
  },
});
