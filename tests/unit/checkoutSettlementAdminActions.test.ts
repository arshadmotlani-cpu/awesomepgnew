import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('checkout settlement admin actions file exports only async functions', () => {
  const src = read('app/(admin)/admin/checkout-settlements/actions.ts');
  assert.match(src, /^'use server';/m);
  assert.doesNotMatch(src, /^export type /m);
  assert.doesNotMatch(src, /^export const /m);
  assert.doesNotMatch(src, /^export \{[^}]*\} from/m);
});
