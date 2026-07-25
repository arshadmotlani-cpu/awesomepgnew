import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('deposit booking admin actions file exports only async functions', () => {
  const src = read('app/(admin)/admin/deposits/[bookingId]/actions.ts');
  assert.match(src, /^'use server';/m);
  assert.doesNotMatch(src, /^export type /m);
  assert.doesNotMatch(src, /^export const /m);
  assert.doesNotMatch(src, /^export \{[^}]*\} from/m);
});

test('DepositAdjustForms imports action state outside use server boundary', () => {
  const src = read('src/components/admin/DepositAdjustForms.tsx');
  assert.match(src, /depositBookingActionTypes/);
  assert.doesNotMatch(
    src,
    /initialActionState[\s\S]*from '@\/app\/\(admin\)\/admin\/deposits\/\[bookingId\]\/actions'/,
  );
});
