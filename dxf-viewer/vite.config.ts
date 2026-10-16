import { defineConfig } from 'vite';

// base: './' — сайт работает из любой подпапки (GitHub Pages, Netlify, просто папка на диске).
export default defineConfig({
  base: './',
  // INLINE_ASSETS=1 — шрифты уходят внутрь CSS (нужно для публикации превью одной страницей).
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: process.env.INLINE_ASSETS ? 200_000 : 4096 },
  test: { include: ['tests/**/*.test.ts'] },
});
