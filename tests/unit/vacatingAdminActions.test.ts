import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('vacating admin actions file exports only async functions', () => {
  const src = read('app/(admin)/admin/vacating/actions.ts');
  assert.match(src, /^'use server';/m);
  assert.doesNotMatch(src, /^export type /m);
  assert.doesNotMatch(src, /^export const /m);
  assert.doesNotMatch(src, /^export \{[^}]*\} from/m);
});

test('date change admin actions live in dedicated server module', () => {
  const src = read('app/(admin)/admin/vacating/dateChangeActions.ts');
  assert.match(src, /^'use server';/m);
  assert.match(src, /approveVacatingDateChangeAction/);
  assert.doesNotMatch(src, /^export type /m);
});

test('VacatingActions imports action state type outside use server boundary', () => {
  const src = read('src/components/admin/VacatingActions.tsx');
  assert.match(src, /vacatingActionTypes/);
  assert.doesNotMatch(src, /type ActionState[\s\S]*from '@\/app\/\(admin\)\/admin\/vacating\/actions'/);
});
