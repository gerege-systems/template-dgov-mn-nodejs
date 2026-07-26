// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite тохиргоо. Build нь ЦЭВЭР СТАТИК файл гаргана (nginx үйлчилнэ) —
 * server талын код БАЙХГҮЙ тул нууц энэ багцад хэзээ ч ороогүй байх ёстой.
 *
 * Dev үед `/api` болон OIDC-ийн үндэс дэх замуудыг локал api контейнер руу
 * проксилно — production дахь nginx-ийн зан үйлийг давтана (ижил origin тул
 * cookie болон CSRF нь адилхан ажиллана).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: false },
      '/oauth2': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: false },
      '/userinfo': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: false },
      '/.well-known': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Chunk-уудыг тогтвортой нэрлэнэ — nginx урт кэштэй үйлчилнэ.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
