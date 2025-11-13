import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
        'public/**',
      ],
    },
    testTimeout: 30000,
    include: [
      'tests/**/*.test.ts',
      // Exclude e2e tests that require playwright
      '!tests/e2e/**/*.spec.ts',
    ],
    exclude: [
      'node_modules/**',
      'public/**',
      'dist/**',
      '.wrangler/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@views': path.resolve(__dirname, './src/views'),
      '@functions': path.resolve(__dirname, './functions'),
    },
  },
});