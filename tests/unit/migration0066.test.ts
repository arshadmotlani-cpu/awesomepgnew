import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import test from 'node:test';

test('0066 enum migration does not use new label in same file', () => {
  const sql = readFileSync('src/db/migrations/0066_booking_pending_approval.sql', 'utf8');
  assert.match(sql, /ADD VALUE.*pending_approval/i);
  assert.doesNotMatch(sql, /UPDATE[\s\S]*pending_approval/i);
});

test('0067 backfill migration exists separately from enum extension', () => {
  const sql = readFileSync('src/db/migrations/0067_booking_pending_approval_backfill.sql', 'utf8');
  assert.match(sql, /UPDATE[\s\S]*pending_approval/i);
  assert.doesNotMatch(sql, /ADD VALUE/i);
});
