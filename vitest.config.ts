import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    // A real (non-opaque) origin makes jsdom expose a native localStorage whose
    // methods live on Storage.prototype, which the storage tests spy on.
    environmentOptions: {
      jsdom: { url: 'http://localhost:3000/' },
    },
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    globals: false,
  },
});
