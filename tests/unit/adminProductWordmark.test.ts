import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('AdminProductWordmark is product-name-only with no rectangular container', () => {
  const wordmark = read('src/components/brand/AdminProductWordmark.tsx');
  const tokens = read('src/lib/brand/adminWordmarkTokens.ts');

  assert.match(wordmark, /data-admin-wordmark=\{product\}/);
  assert.match(wordmark, /\{token\.label\}/);
  assert.match(wordmark, /height: size/);
  assert.match(wordmark, /width: 'auto'/);
  assert.match(wordmark, /ADMIN_WORDMARK_FONT/);
  assert.match(wordmark, /fontWeight: 800/);
  assert.match(wordmark, /role="img"/);

  assert.doesNotMatch(wordmark, /<img\b/);
  assert.doesNotMatch(wordmark, /aspect-square|aspect-\[|h-8 w-8|w-8 h-8/);
  assert.doesNotMatch(wordmark, /rounded-(?:md|lg|xl|full|\[)/);
  assert.doesNotMatch(wordmark, /bg-black|bg-\[#000|backgroundColor/);
  assert.doesNotMatch(wordmark, /textShadow|boxShadow|drop-shadow/);
  assert.doesNotMatch(wordmark, /Capital OS|Owner OS|For Your Hair|ADMIN PANEL|Luxury Salon/);

  assert.match(tokens, /label: 'SOFT'/);
  assert.match(tokens, /label: 'AUTO'/);
  assert.match(tokens, /label: 'NET WORTH'/);
  assert.doesNotMatch(tokens, /label: '(?:SOFT|AUTO|NET WORTH) .+'/);
  assert.doesNotMatch(tokens, /ADMIN PANEL|Luxury Salon|Automotive Capital|Owner OS|For Your Hair/);
});

test('AdminProductWordmark is not forced into square dimensions', () => {
  const wordmark = read('src/components/brand/AdminProductWordmark.tsx');
  assert.match(wordmark, /width: 'auto'/);
  assert.doesNotMatch(
    wordmark,
    /width:\s*size[,}]/,
    'wordmark must not set width equal to the height slot',
  );
});

test('PG admin mark remains the finalized PNG and does not use AdminProductWordmark', () => {
  const pg = read('src/components/brand/apg-os/ApgOsMark.tsx');
  assert.match(pg, /export const APG_OS_MARK_SRC = '\/admin-os\/pg-admin-mark\.png'/);
  assert.match(pg, /width: 512/);
  assert.match(pg, /height: 462/);
  assert.match(pg, /width: 'auto'/);
  assert.doesNotMatch(pg, /AdminProductWordmark/);
  assert.doesNotMatch(pg, /ADMIN_WORDMARK/);
});
