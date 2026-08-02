/**
 * Room OS Wave 3 — forbidden-import lint for Operations Centre UI.
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
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
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

const FORBIDDEN_PATTERNS = [
  /from ['"]@\/src\/services\/rentInvoices['"]/,
  /from ['"]@\/src\/services\/occupancySsot['"]/,
  /from ['"]@\/src\/services\/roomElectricityOccupants['"]/,
];

const OPERATIONS_UI_PATHS = [
  'src/components/admin/operations',
  'app/(admin)/admin/operations',
];

describe('Room OS Wave 3 — Forbidden imports (Operations UI)', () => {
  test('Operations Centre UI must not import legacy SSOT composers', () => {
    for (const root of OPERATIONS_UI_PATHS) {
      for (const file of listTsFiles(root)) {
        const src = read(file);
        for (const pattern of FORBIDDEN_PATTERNS) {
          assert.doesNotMatch(
            src,
            pattern,
            `${file} violates Operations UI forbidden-import matrix`,
          );
        }
      }
    }
  });

  test('legacy composers marked deprecated for Wave 3 sunset', () => {
    assert.match(read('src/lib/billing/collectionsQueue.ts'), /@deprecated Wave 3/);
    assert.match(read('src/services/billingCentreDashboard.ts'), /@deprecated Wave 3/);
    assert.match(read('src/services/residentOperationsDashboard.ts'), /@deprecated Wave 3/);
  });

  test('Room OS billing collections adapter exists', () => {
    const adapter = read('src/lib/billing/roomOsCollectionsAdapter.ts');
    assert.match(adapter, /buildRoomOsCollectionsQueue/);
    assert.match(adapter, /getWorkQueue/);
    assert.match(adapter, /loadLedger/);
  });

  test('billing centre can switch via ROOM_OS_BILLING_CENTRE flag', () => {
    const dashboard = read('src/services/billingCentreDashboard.ts');
    assert.match(dashboard, /isRoomOsBillingCentreEnabled/);
    assert.match(dashboard, /buildRoomOsCollectionsQueue/);
  });
});
