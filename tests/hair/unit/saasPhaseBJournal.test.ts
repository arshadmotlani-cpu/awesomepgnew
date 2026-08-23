import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('Hair journal includes closed 0037 and Phase B 0039', () => {
  const raw = readFileSync(resolve(process.cwd(), 'src/hair/db/migrations/meta/_journal.json'), 'utf8');
  const journal = JSON.parse(raw) as { entries: Array<{ tag: string }> };
  const tags = journal.entries.map((e) => e.tag);
  assert.ok(tags.includes('0037_saas_not_null'));
  assert.ok(tags.includes('0039_saas_phase_b'));
  assert.ok(tags.includes('0040_saas_phase_b_defaults'));
  assert.ok(tags.includes('0041_saas_phase_b_sequences'));
  assert.ok(tags.indexOf('0037_saas_not_null') > tags.indexOf('0038_saas_waitlist_signups'));
});

test('FYH_SAAS_TENANT is not flipped on in the Phase B migration', () => {
  const sql = readFileSync(resolve(process.cwd(), 'src/hair/db/migrations/0039_saas_phase_b.sql'), 'utf8');
  assert.ok(sql.includes('wf_auth_sessions'));
  assert.ok(sql.includes('SET NOT NULL'));
  assert.equal(/FYH_SAAS_TENANT\s*=/.test(sql), false);
});
