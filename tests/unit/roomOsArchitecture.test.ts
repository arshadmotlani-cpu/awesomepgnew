/**
 * Architecture guard — Room OS forbidden dependency matrix.
 * See docs/ROOM_OS.md and docs/ARCHITECTURE.md.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function listTsFiles(dir: string): string[] {
  const abs = join(process.cwd(), dir);
  const entries = readdirSync(abs);
  const files: string[] = [];
  for (const entry of entries) {
    const rel = join(dir, entry);
    const full = join(process.cwd(), rel);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(rel));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(rel);
    }
  }
  return files;
}

function roomOsSources(): string[] {
  return listTsFiles('src/roomOs');
}

describe('Room OS architecture guards', () => {
  test('projectors must not import React or Next.js', () => {
    const projectorFiles = roomOsSources().filter((f) => f.includes('/projectors/'));
    for (const file of projectorFiles) {
      const src = read(file);
      assert.doesNotMatch(src, /from ['"]react['"]/);
      assert.doesNotMatch(src, /from ['"]next\//);
    }
  });

  test('rules module must not import db client', () => {
    const ruleFiles = roomOsSources().filter((f) => f.includes('/rules/'));
    for (const file of ruleFiles) {
      const src = read(file);
      assert.doesNotMatch(src, /from ['"]@\/src\/db\/client['"]/);
      assert.doesNotMatch(src, /from ['"]@\/src\/db\/schema/);
    }
  });

  test('decision API must not import legacy billing centre composer', () => {
    const src = read('src/roomOs/api/v1/decision.ts');
    assert.doesNotMatch(src, /billingCentreDashboard/);
    assert.doesNotMatch(src, /occupancySsot/);
    assert.doesNotMatch(src, /roomElectricityOccupants/);
  });

  test('projectors must not import settlement V2 compute', () => {
    const projectorFiles = roomOsSources().filter((f) => f.includes('/projectors/'));
    for (const file of projectorFiles) {
      const src = read(file);
      assert.doesNotMatch(src, /checkoutSettlementEngineV2/);
      assert.doesNotMatch(src, /persistPaymentApprovalAllocation/);
    }
  });

  test('Wave 0 exposes transactional outbox schema migration', () => {
    const migration = read('src/db/migrations/0132_room_os_outbox.sql');
    assert.match(migration, /room_os_outbox/);
    assert.match(migration, /status text NOT NULL DEFAULT 'pending'/);
  });

  test('ROOM_OS.md documents truth ladder and forbidden matrix', () => {
    const doc = read('docs/ROOM_OS.md');
    assert.match(doc, /Truth ladder/);
    assert.match(doc, /Forbidden dependencies/);
    assert.match(doc, /WorkQueueProjector/);
    assert.match(doc, /BookingContext/);
  });

  test('ARCHITECTURE.md links Room OS and forbidden matrix', () => {
    const doc = read('docs/ARCHITECTURE.md');
    assert.match(doc, /\[\[ROOM_OS\]\]/);
    assert.match(doc, /Forbidden dependency matrix/);
  });
});
