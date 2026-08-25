import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // A página de download passa pelo pipeline de HTML do Vite (e não fica em
      // public/) só para o %VITE_API_URL% ser substituído no build. Em public/
      // o arquivo seria copiado literalmente, com o placeholder intacto.
      input: {
        index: resolve(__dirname, 'index.html'),
        download: resolve(__dirname, 'download.html'),
      },
    },
  },
});
