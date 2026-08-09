import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@caseattend/react/styles.css',
        replacement: path.resolve(import.meta.dirname, '../../packages/react/styles.css'),
      },
      {
        find: /^@caseattend\/react$/,
        replacement: path.resolve(import.meta.dirname, '../../packages/react/src/index.ts'),
      },
      {
        find: /^@caseattend\/core$/,
        replacement: path.resolve(import.meta.dirname, '../../packages/core/src/index.ts'),
      },
    ],
  },
  server: {
    port: 4175,
    strictPort: true,
    hmr: false,
  },
  preview: {
    port: 4275,
    strictPort: true,
  },
});
