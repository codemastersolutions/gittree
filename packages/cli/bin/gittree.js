#!/usr/bin/env node
import { run } from '../dist/index.js';

run()
  .then((code) => {
    process.exitCode = typeof code === 'number' && Number.isFinite(code) ? code : 1;
  })
  .catch((err) => {
    const msg = err instanceof Error ? err.stack ?? String(err.message) : String(err);
    process.stderr.write('fatal: ' + msg + '\n');
    process.exitCode = 1;
  });
