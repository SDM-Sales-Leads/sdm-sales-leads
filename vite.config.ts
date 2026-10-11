import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // relative paths so the site works under any GitHub Pages sub-folder
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: '127.0.0.1' },
  build: { sourcemap: false, chunkSizeWarningLimit: 2500 },
});
