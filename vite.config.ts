import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  define: {
    __CASEATTEND_APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.3.0'),
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  // Disable Vite's modulePreload polyfill: it injects an inline <script> that a
  // strict `script-src 'self'` CSP would block. Browsers we target support
  // <link rel="modulepreload"> natively, so the polyfill isn't needed.
  build: {
    modulePreload: { polyfill: false },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
