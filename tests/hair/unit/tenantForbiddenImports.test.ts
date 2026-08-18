import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const SERVICES_DIR = join(process.cwd(), 'src/hair/services');

function collectServiceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) continue;
    if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

test('hair services import tenant filters when querying hairDb', () => {
  const files = collectServiceFiles(SERVICES_DIR);
  const missing: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('hairDb') && !src.includes('from(fyh')) continue;
    if (
      !src.includes('orgFilter') &&
      !src.includes('tenantWriteDefaults') &&
      !src.includes('tenantOrgDefaults')
    ) {
      missing.push(file.replace(process.cwd() + '/', ''));
    }
  }
  assert.equal(missing.length, 0, `Services missing tenant helpers: ${missing.join(', ')}`);
});

test('platform db client is not imported from hair services', () => {
  const files = collectServiceFiles(SERVICES_DIR);
  const violations: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (src.includes('@/src/platform/db/client') || src.includes('platformDb')) {
      violations.push(file.replace(process.cwd() + '/', ''));
    }
  }
  assert.equal(violations.length, 0, `Hair services must not import platformDb: ${violations.join(', ')}`);
});
