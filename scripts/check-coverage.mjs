#!/usr/bin/env node
/**
 * Layer-2 coverage gate for CI/release workflows.
 *
 * Re-reads the JSON summary produced by `vitest run --coverage`
 * (`coverage/coverage-summary.json`) and re-applies the same
 * thresholds declared in `vitest.config.ts`. This is a safety
 * net in addition to vitest's own threshold enforcement.
 *
 * Vitest's v8 reporter emits `coverage-summary.json` automatically
 * when `json-summary` is in the reporter list. If for some reason
 * the summary file is missing but `coverage-final.json` exists,
 * we derive the totals from the v8 counter maps so the gate still
 * has something to read.
 *
 * Thresholds are kept in sync with `vitest.config.ts`:
 *   lines / functions / statements ≥ 90%
 *   branches                                 ≥ 80%
 *
 * Exit 0  → all thresholds met.
 * Exit 1  → any threshold missed OR inputs missing entirely.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const SUMMARY_PATH = resolve(REPO_ROOT, 'coverage/coverage-summary.json');
const FINAL_PATH = resolve(REPO_ROOT, 'coverage/coverage-final.json');

const THRESHOLDS = {
  lines: 90,
  functions: 90,
  branches: 80,
  statements: 90,
};

/**
 * Derive a minimal { total: { lines, statements, functions, branches } }
 * summary from a v8 `coverage-final.json`. The v8 schema stores counts
 * under the keys 's' (statements), 'f' (functions), 'b' (branches) for
 * each file entry.
 */
function deriveSummaryFromFinal(finalPath) {
  const raw = JSON.parse(readFileSync(finalPath, 'utf8'));
  const totals = { lines: 0, statements: 0, functions: 0, branches: 0 };
  const covered = { lines: 0, statements: 0, functions: 0, branches: 0 };

  for (const file of Object.values(raw)) {
    for (const [kind, key] of [
      ['statements', 's'],
      ['functions', 'f'],
      ['branches', 'b'],
    ]) {
      const counts = file[key] || {};
      const entries = Object.values(counts);
      totals[kind] += entries.length;
      covered[kind] += entries.filter((entry) => (entry ?? 0) > 0).length;
    }
  }

  // v8 doesn't differentiate lines from statements in the count map;
  // vitest's summary still records identical numbers for both, so we
  // mirror that to keep the gate logic single-source-of-truth.
  totals.lines = totals.statements;
  covered.lines = covered.statements;

  const pct = (kind) => {
    if (totals[kind] === 0) return 100;
    return Number(((100 * covered[kind]) / totals[kind]).toFixed(2));
  };

  return {
    total: {
      lines: { pct: pct('lines') },
      statements: { pct: pct('statements') },
      functions: { pct: pct('functions') },
      branches: { pct: pct('branches') },
    },
  };
}

function loadSummary() {
  if (existsSync(SUMMARY_PATH)) {
    return JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
  }
  if (existsSync(FINAL_PATH)) {
    console.warn('⚠️  coverage-summary.json missing; deriving from coverage-final.json');
    const derived = deriveSummaryFromFinal(FINAL_PATH);
    mkdirSync(resolve(REPO_ROOT, 'coverage'), { recursive: true });
    writeFileSync(SUMMARY_PATH, JSON.stringify(derived, null, 2));
    return derived;
  }
  console.error(
    '❌ Neither coverage/coverage-summary.json nor coverage/coverage-final.json found.\n' +
      '   Did `pnpm test:coverage` run successfully?',
  );
  process.exit(1);
}

function check(summary) {
  const total = summary.total || {};
  let ok = true;

  for (const [kind, min] of Object.entries(THRESHOLDS)) {
    const value = total[kind]?.pct;
    const numeric = Number(value);
    const display = Number.isFinite(numeric) ? `${numeric}%` : 'N/A';
    const passed = Number.isFinite(numeric) && numeric >= min;
    console.log(`  ${kind.padEnd(10)} ${display.padStart(7)} (≥ ${min}%) ${passed ? '✅' : '❌'}`);
    if (!passed) ok = false;
  }

  return ok;
}

const summary = loadSummary();
console.log('Coverage gate:');
const ok = check(summary);
if (!ok) {
  console.error('❌ Coverage below thresholds');
  process.exit(1);
}
console.log('✅ Coverage OK');
