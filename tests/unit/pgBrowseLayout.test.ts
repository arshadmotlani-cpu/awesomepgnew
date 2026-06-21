import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('browse PG grid uses normal document flow without spatial parallax layers', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/world/SpatialPgExplorer.tsx'),
    'utf8',
  );
  assert.match(source, /grid grid-cols-1 gap-6/);
  assert.doesNotMatch(source, /<WorldLayer depth=\{i/);
  assert.doesNotMatch(source, /world-pg-block/);
  assert.doesNotMatch(source, /rotateX/);
  assert.doesNotMatch(source, /float=\{i/);
});

test('PG card reserves hero image aspect ratio', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/customer/PgCard.tsx'),
    'utf8',
  );
  assert.match(source, /aspect-\[16\/9\]/);
});
