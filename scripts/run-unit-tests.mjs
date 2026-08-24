#!/usr/bin/env node
/**
 * Cross-platform unit/integration test runner for local dev + CI.
 * Expands test files explicitly so shell glob differences never skip the suite.
 *
 * Usage:
 *   node scripts/run-unit-tests.mjs           — full monorepo
 *   node scripts/run-unit-tests.mjs hair      — tests/hair only (default serial: --test-concurrency=1)
 *   node scripts/run-unit-tests.mjs capital   — tests/capital only
 *   node scripts/run-unit-tests.mjs pg        — Awesome PG (default serial: --test-concurrency=1)
 *
 * Override concurrency: TEST_CONCURRENCY=4 node scripts/run-unit-tests.mjs hair
 * Default serial for hair/pg matches CI (TEST_CONCURRENCY=1) and avoids parallel source-scan flakes.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} dir @param {string[]} out */
function collectTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      collectTests(path, out);
      continue;
    }
    if (name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

const PRODUCTS = {
  hair: ['tests/hair'],
  capital: ['tests/capital'],
  owner: ['tests/owner'],
  pg: ['tests/unit', 'tests/integration'],
};

const ALL_DIRS = [
  'tests/unit',
  'tests/integration',
  'tests/capital',
  'tests/hair',
  'tests/owner',
];

const productArg = process.argv[2]?.trim().toLowerCase();
let dirs;
if (!productArg) {
  dirs = ALL_DIRS;
} else if (PRODUCTS[productArg]) {
  dirs = PRODUCTS[productArg];
} else {
  console.error(
    `Unknown product "${process.argv[2]}". Use: hair | capital | owner | pg (or omit for full repo).`,
  );
  process.exit(1);
}

const files = dirs.flatMap((d) => collectTests(d)).sort();

if (files.length === 0) {
  console.error(`No test files found for: ${dirs.join(', ')}`);
  process.exit(1);
}

if (productArg) {
  console.error(`[run-unit-tests] product=${productArg} files=${files.length}`);
}

const args = ['--import', 'tsx', '--test'];
let concurrency = process.env.TEST_CONCURRENCY?.trim();
if (!concurrency && (productArg === 'hair' || productArg === 'pg')) {
  concurrency = '1';
}
if (concurrency) args.push(`--test-concurrency=${concurrency}`);
args.push(...files);

const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
