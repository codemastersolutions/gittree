import * as esbuild from 'esbuild';
import fs from 'node:fs';

const watch = process.argv.includes('--watch');

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

/** @type {import('esbuild').BuildOptions} */
const common = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/extension.js',
  sourcemap: true,
  logLevel: 'info',
  define: {
    'process.env.EXTENSION_VERSION': JSON.stringify(pkg.version),
  },
};

if (watch) {
  const ctx = await esbuild.context(common);
  await ctx.watch();
  console.log('[gittree-vscode] esbuild watching...');
} else {
  await esbuild.build(common);
  // Write a minimal dts stub (real types via package root)
  if (!fs.existsSync('dist')) fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/extension.d.ts', 'export {};\n');
  console.log('[gittree-vscode] Build complete.');
}
