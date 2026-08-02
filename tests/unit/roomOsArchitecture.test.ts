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

  test('Wave 2 exposes property_os_index materialization migration', () => {
    const migration = read('src/db/migrations/0133_property_os_index.sql');
    assert.match(migration, /property_os_index/);
    assert.match(migration, /property_os_index_pg_month_unique/);
  });

  test('Wave 2 exposes work_queue_index materialization migration', () => {
    const migration = read('src/db/migrations/0134_work_queue_index.sql');
    assert.match(migration, /work_queue_index/);
    assert.match(migration, /work_queue_index_pg_month_unique/);
  });

  test('ROOM_OS.md documents truth ladder and forbidden matrix', () => {
    const doc = read('docs/ROOM_OS.md');
    assert.match(doc, /Truth ladder/);
    assert.match(doc, /Forbidden dependencies/);
    assert.match(doc, /WorkQueueProjector/);
    assert.match(doc, /BookingContext/);
  });

  test('event catalog separates rebuild command from reserved materialized fact', () => {
    const catalog = read('src/roomOs/events/catalog.ts');
    assert.match(catalog, /property_index\.rebuild_requested/);
    assert.match(catalog, /property_index\.materialized/);
    assert.match(catalog, /Reserved fact-only/);
  });

  test('PropertyProjector registry handler is registered', () => {
    const src = read('src/roomOs/projectors/registry.ts');
    assert.match(src, /propertyProjector/);
    assert.doesNotMatch(src, /noopProjector\('PropertyProjector'/);
  });

  test('WorkQueueProjector registry handler is registered', () => {
    const src = read('src/roomOs/projectors/registry.ts');
    assert.match(src, /workQueueProjector/);
    assert.doesNotMatch(src, /noopProjector\('WorkQueueProjector'/);
  });

  test('WorkQueueProjector reads PropertyOsIndexSnapshot only — not engines or SSOT', () => {
    const workQueueFiles = listTsFiles('src/roomOs/projectors/workQueue');
    const engineSnapshotTypes = ['BedBrainSnapshot', 'BookingLedgerSnapshot', 'RoomOsSharedSnapshot'];
    const forbiddenImports = [
      /@\/src\/roomOs\/engines\//,
      /buildBedBrainSnapshot/,
      /buildRoomSharedSnapshot/,
      /buildBookingLedgerSnapshot/,
      /projectPropertyOsBundle/,
      /occupancySsot/,
      /residentFinancialEngine/,
    ];

    for (const file of workQueueFiles) {
      const src = read(file);
      for (const pattern of forbiddenImports) {
        assert.doesNotMatch(src, pattern, `${file} must not depend on engines or live SSOT`);
      }
      for (const typeName of engineSnapshotTypes) {
        assert.doesNotMatch(src, new RegExp(typeName), `${file} must not reference engine snapshot ${typeName}`);
      }
    }

    const rebuildSrc = read('src/roomOs/projectors/workQueue/rebuildWorkQueueIndex.ts');
    assert.match(rebuildSrc, /loadMaterializedPropertyIndex/);
    assert.doesNotMatch(rebuildSrc, /propertyIndex\?:/);

    const projectSrc = read('src/roomOs/projectors/workQueue/projectWorkQueue.ts');
    assert.match(projectSrc, /PropertyOsIndexSnapshot/);
    assert.doesNotMatch(projectSrc, /bedBrains|roomShared|ledgers/);
  });

  test('ROOM_OS.md documents WorkQueue dependency chain', () => {
    const doc = read('docs/ROOM_OS.md');
    assert.match(doc, /Projection dependency chain/);
    assert.match(doc, /property_os_index/);
    assert.match(doc, /work_queue_index/);
    assert.match(doc, /never reads engine outputs/);
  });

  test('ARCHITECTURE.md links Room OS and forbidden matrix', () => {
    const doc = read('docs/ARCHITECTURE.md');
    assert.match(doc, /\[\[ROOM_OS\]\]/);
    assert.match(doc, /Forbidden dependency matrix/);
  });

  test('ledger writers enqueue via outbox helper only', () => {
    const writerFiles = [
      'src/services/booking.ts',
      'src/services/bookingLifecycle.ts',
      'src/services/meterElectricity.ts',
      'src/services/electricityBilling.ts',
      'src/services/rentInvoices.ts',
      'src/services/deposits.ts',
      'src/services/depositSettlement.ts',
      'src/services/vacating.ts',
    ];
    for (const file of writerFiles) {
      const src = read(file);
      if (!src.includes('enqueuePropertyIndexRebuildFromWriter')) continue;
      assert.doesNotMatch(src, /from ['"]@\/src\/roomOs\/projectors\//);
      assert.doesNotMatch(src, /enqueuePropertyIndexRebuild\(/);
    }
  });

  test('integrity module must not import projectors, repair writers, or React', () => {
    const integrityFiles = listTsFiles('src/roomOs/integrity');
    const forbiddenPatterns = [
      /@\/src\/roomOs\/projectors\//,
      /billingIntegrityRepair/,
      /checkoutSettlementRepair/,
      /checkoutSettlementEngineV2/,
      /from ['"]react['"]/,
      /from ['"]next\//,
    ];
    for (const file of integrityFiles) {
      const src = read(file);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(src, pattern, `${file} violates integrity forbidden matrix`);
      }
    }
  });

  test('ROOM_OS.md documents Integrity Engine v1 preflight', () => {
    const doc = read('docs/ROOM_OS.md');
    assert.match(doc, /Integrity Engine v1/);
    assert.match(doc, /integrity\/v1\/runPreflight/);
    assert.match(doc, /ADR-OR-001/);
  });

  test('certification module must not import repair writers or outbox append', () => {
    const certFiles = listTsFiles('src/roomOs/certification');
    const forbiddenPatterns = [
      /billingIntegrityRepair/,
      /checkoutSettlementRepair/,
      /appendRoomOsOutboxEntry/,
      /enqueuePropertyIndexRebuildFromWriter/,
      /from ['"]react['"]/,
      /from ['"]next\//,
    ];
    for (const file of certFiles) {
      const src = read(file);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(src, pattern, `${file} violates certification forbidden matrix`);
      }
    }
  });

  test('ROOM_OS.md documents Certification Engine v1 release gate', () => {
    const doc = read('docs/ROOM_OS.md');
    assert.match(doc, /Certification Engine v1/);
    assert.match(doc, /certification\/v1\/run/);
    assert.match(doc, /shantinagar-v1/);
    assert.match(doc, /read-only/);
  });

  test('ROOM_OS.md documents Operations Centre feature flag migration', () => {
    const doc = read('docs/ROOM_OS.md');
    assert.match(doc, /Operations Centre migration/);
    assert.match(doc, /ROOM_OS_OPERATIONS_QUEUE/);
  });

  test('Wave 2 completion — outbox cron route exists and wires processor', () => {
    const route = read('app/api/cron/room-os-outbox/route.ts');
    assert.match(route, /drainRoomOsOutbox/);
    assert.match(route, /getRoomOsOutboxMetrics/);
    assert.match(route, /CRON_SECRET/);
  });

  test('Wave 2 completion — cert script and npm scripts exist', () => {
    const certScript = read('scripts/run-room-os-wave2-certification.ts');
    assert.match(certScript, /runShantinagarParity/);
    assert.match(certScript, /certificationBlocksRelease/);
    const pkg = read('package.json');
    assert.match(pkg, /"cert:room-os-wave2"/);
    assert.match(pkg, /"bench:room-os-wave2"/);
  });

  test('acceptance modules must not import projectors or repair writers', () => {
    const acceptanceFiles = listTsFiles('src/roomOs/acceptance');
    const forbiddenPatterns = [
      /@\/src\/roomOs\/projectors\//,
      /billingIntegrityRepair/,
      /checkoutSettlementRepair/,
      /appendRoomOsOutboxEntry/,
      /enqueuePropertyIndexRebuildFromWriter/,
    ];
    for (const file of acceptanceFiles) {
      const src = read(file);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(src, pattern, `${file} violates acceptance forbidden matrix`);
      }
    }
  });

  test('Wave 3 — loadBookingContext implemented; RFE bridge module exists', () => {
    const roomOsApi = read('src/roomOs/api/v1/roomOs.ts');
    assert.match(roomOsApi, /buildBookingContextSnapshot/);
    const bridge = read('src/roomOs/bridges/rfeBedBrainBridge.ts');
    assert.match(bridge, /applyLedgerTotalsToSummary/);
    assert.match(read('src/roomOs/certification/catalog/v1/checks.ts'), /RFE_BED_BRAIN_BRIDGE/);
  });

  test('Wave 4 — explain/replay modules must not import repair writers or persist writers', () => {
    const wave4Files = [
      ...listTsFiles('src/roomOs/explain'),
      ...listTsFiles('src/roomOs/replay'),
    ];
    const forbiddenPatterns = [
      /billingIntegrityRepair/,
      /checkoutSettlementRepair/,
      /appendRoomOsOutboxEntry/,
      /upsertMaterializedPropertyIndex/,
      /upsertMaterializedWorkQueue/,
      /from ['"]react['"]/,
      /checkoutSettlementEngineV2/,
    ];
    for (const file of wave4Files) {
      const src = read(file);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(src, pattern, `${file} violates Wave 4 explain/replay forbidden matrix`);
      }
    }
  });

  test('Wave 4 — explain and replay v1 APIs exist', () => {
    assert.match(read('src/roomOs/api/v1/explain.ts'), /explain\/v1/);
    assert.match(read('src/roomOs/api/v1/replay.ts'), /replay\/v1/);
    assert.match(read('src/roomOs/certification/catalog/v1/checks.ts'), /REPLAY_SAMPLE_PARITY/);
  });
});
