import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.interface.ts',
        '**/*.dto.ts',
        '**/*.module.ts',
        '**/*.spec.ts',
        'src/main.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@modules': resolve(__dirname, './src/modules'),
      '@utils': resolve(__dirname, './src/utils'),
      '@db': resolve(__dirname, './src/db'),
      '@env': resolve(__dirname, './src/env'),
      '@jobs': resolve(__dirname, './src/jobs'),
    },
  },
});