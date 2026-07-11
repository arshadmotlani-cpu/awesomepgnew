#!/usr/bin/env node
/**
 * Cross-platform unit/integration test runner for local dev + CI.
 * Expands test files explicitly so shell glob differences never skip the suite.
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

const files = [
  ...collectTests('tests/unit'),
  ...collectTests('tests/integration'),
  ...collectTests('tests/capital/unit'),
].sort();

if (files.length === 0) {
  console.error('No unit/integration test files found');
  process.exit(1);
}

const args = ['--import', 'tsx', '--test'];
const concurrency = process.env.TEST_CONCURRENCY?.trim();
if (concurrency) args.push(`--test-concurrency=${concurrency}`);
args.push(...files);

const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
