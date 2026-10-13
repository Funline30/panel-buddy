import { defineConfig } from 'vite';

// Relative base so the same build works at the site root on Vercel and on any sub-path.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2019',
    chunkSizeWarningLimit: 1200,
  },
});
