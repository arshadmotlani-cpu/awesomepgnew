import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import test from 'node:test';

const MIGRATIONS_DIR = resolve(process.cwd(), 'src/hair/db/migrations');
const JOURNAL_PATH = resolve(MIGRATIONS_DIR, 'meta/_journal.json');

test('every Hair SQL migration file is registered in drizzle journal', () => {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  const journalTags = new Set(journal.entries.map((e) => e.tag));

  const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => basename(name, '.sql'));

  const missing = sqlFiles.filter((tag) => !journalTags.has(tag));
  assert.deepEqual(
    missing,
    [],
    `Hair migrations missing from meta/_journal.json (will never run in production): ${missing.join(', ')}`,
  );
});

test('RBAC v2 permission constraint migration is journaled after workforce grants', () => {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  const tags = journal.entries.map((e) => e.tag);
  assert.ok(tags.includes('0049_permission_constraints'));
  assert.ok(tags.indexOf('0049_permission_constraints') > tags.indexOf('0019_permissions'));
});
