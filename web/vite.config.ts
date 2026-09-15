import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  /* A interface anterior passou a viver em /legado: o app do anexo ocupa a raiz. */
  base: '/legado/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3333', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
