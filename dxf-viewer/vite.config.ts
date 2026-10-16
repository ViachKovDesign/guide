import { defineConfig } from 'vite';

// base: './' — сайт работает из любой подпапки (GitHub Pages, Netlify, просто папка на диске).
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'] },
});
