#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

const files = collectTests('tests/hair').sort();
if (!files.length) {
  console.error('No Hair test files found under tests/hair');
  process.exit(1);
}

const args = ['--import', 'tsx', '--test', ...files];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
