import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
  noExternal: [/./],
  tsconfig: './tsconfig.json',
  outDir: 'dist',
});
