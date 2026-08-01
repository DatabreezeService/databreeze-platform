import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { WEB_SECURITY_HEADERS } from './security-headers.ts';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: WEB_SECURITY_HEADERS,
  },
  preview: {
    headers: WEB_SECURITY_HEADERS,
  },
});
