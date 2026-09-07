import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // The rules under test are pure — no DOM, no React, no network.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    // Matches the `@/*` path alias in tsconfig.json.
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
