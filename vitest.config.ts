import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'packages/vscode/src/webview/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['packages/core/src/**/*.ts', 'packages/cli/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.{test,spec}.ts',
        'packages/*/src/**/*.d.ts',
        'packages/*/src/**/__fixtures__/**',
        'packages/*/src/testing/**',
        'packages/core/src/index.ts',
        'packages/core/src/adapters/real-git-adapter.ts',
        'packages/core/src/types/index.ts',
        'packages/core/src/adapters/types.ts',
        'packages/cli/src/**',
      ],
      all: true,
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
      },
    },
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      // ⚠️ ORDEM IMPORTA: Vite procura aliases na ordem das keys; sempre
      // declare subpaths (/testing) ANTES de seus módulos pai para evitar
      // prefix-match acidental no módulo pai.
      '@gittree/core/testing': path.resolve(__dirname, 'packages/core/src/testing/index.ts'),
      '@codemastersolutions/gittree-core/testing': path.resolve(
        __dirname,
        'packages/core/src/testing/index.ts',
      ),
      '@gittree/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@codemastersolutions/gittree-core': path.resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
});
