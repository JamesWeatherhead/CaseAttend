import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rawBuildRevision = process.env.CF_PAGES_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? process.env.VERCEL_GIT_COMMIT_SHA
  ?? 'development';
const buildRevision = /^[a-f0-9]{7,64}$/i.test(rawBuildRevision)
  ? rawBuildRevision.toLowerCase()
  : 'development';
const sourceTreeUrl = `https://github.com/JamesWeatherhead/CaseAttend/tree/${
  buildRevision === 'development' ? 'main' : buildRevision
}`;

export default defineConfig({
  define: {
    __CASEATTEND_APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.4.0'),
    __CASEATTEND_BUILD_REVISION__: JSON.stringify(buildRevision),
    __CASEATTEND_SOURCE_TREE_URL__: JSON.stringify(sourceTreeUrl),
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
