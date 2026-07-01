/**
 * Cross-platform test runner for Node's built-in test runner.
 * npm's test script cannot rely on shell glob expansion (breaks in GitHub Actions).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function collectTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectTestFiles(path));
    } else if (name.endsWith('.test.ts')) {
      files.push(path);
    }
  }
  return files;
}

const roots = ['tests/unit', 'tests/integration'];
const testFiles = roots.flatMap((root) => collectTestFiles(root)).sort();

if (testFiles.length === 0) {
  console.error('No test files found under tests/unit or tests/integration');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
