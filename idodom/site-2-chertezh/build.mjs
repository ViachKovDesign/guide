// Сборка: node build.mjs  →  app.js (один файл, открывается без сервера)
import { build, context } from 'esbuild';
const opts = {
  entryPoints: ['src/main.jsx'], bundle: true, minify: true, format: 'iife', target: ['es2020'],
  jsx: 'automatic', outfile: 'app.js', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
};
if (process.argv.includes('--watch')) { const ctx = await context(opts); await ctx.watch(); console.log('watching…'); }
else await build(opts);
