import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./tests/integration/setup.ts'],
    fileParallelism: false
  },
  resolve: {
    alias: {
      '@gittree/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@codemastersolutions/gittree-core': path.resolve(
        __dirname,
        'packages/core/src/index.ts',
      ),
    },
  },
});
