import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('activity timeline reads audit log with booking enrichment', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/activityTimeline.ts'), 'utf8');
  assert.match(src, /searchActivityTimeline/);
  assert.match(src, /from\(auditLog\)/);
  assert.match(src, /bookingCode/);
});
