import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('every Hair SQL migration file is registered in meta/_journal.json', () => {
  const dir = join(process.cwd(), 'src/hair/db/migrations');
  const journal = JSON.parse(
    readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> };
  const tags = new Set(journal.entries.map((e) => e.tag));
  const sqlFiles = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''));

  const missingFromJournal = sqlFiles.filter((tag) => !tags.has(tag));
  assert.deepEqual(
    missingFromJournal,
    [],
    `Unregistered Hair migrations: ${missingFromJournal.join(', ')}`,
  );

  const missingSqlFiles = journal.entries
    .map((e) => e.tag)
    .filter((tag) => !sqlFiles.includes(tag));
  assert.deepEqual(
    missingSqlFiles,
    [],
    `Journal references missing SQL files (breaks Vercel hair:db:migrate): ${missingSqlFiles.join(', ')}`,
  );
});
