import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  adminMeterLogImageUrl,
  buildRoomTransferMeterLogNote,
  isCrossRoomBedTransfer,
  validateTransferMeterSubmission,
  validateTransferReadingAgainstBaseline,
} from '@/src/lib/roomTransfer/roomChangeTransferMeterEvidencePure';

describe('room change transfer meter evidence', () => {
  test('same-room bed change does not require meter evidence (pure)', () => {
    assert.equal(isCrossRoomBedTransfer('room-a', 'room-a'), false);
    const v = validateTransferMeterSubmission({
      isCrossRoom: false,
      readingUnits: null,
      meterImageUrl: null,
    });
    assert.equal(v.ok, true);
  });

  test('cross-room change requires reading and photo', () => {
    assert.equal(isCrossRoomBedTransfer('room-a', 'room-b'), true);
    assert.equal(
      validateTransferMeterSubmission({
        isCrossRoom: true,
        readingUnits: 450,
        meterImageUrl: null,
      }).ok,
      false,
    );
    assert.equal(
      validateTransferMeterSubmission({
        isCrossRoom: true,
        readingUnits: null,
        meterImageUrl: 'blob:photo',
      }).ok,
      false,
    );
    assert.equal(
      validateTransferMeterSubmission({
        isCrossRoom: true,
        readingUnits: 450,
        meterImageUrl: 'https://private/meter.jpg',
      }).ok,
      true,
    );
  });

  test('cross-room without photo rejected by validation message', () => {
    const v = validateTransferMeterSubmission({
      isCrossRoom: true,
      readingUnits: 100,
      meterImageUrl: '  ',
    });
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.message, /photo/i);
  });

  test('cross-room without reading rejected server-side rule', () => {
    const v = validateTransferMeterSubmission({
      isCrossRoom: true,
      readingUnits: undefined,
      meterImageUrl: 'x',
    });
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.message, /reading/i);
  });

  test('valid submission shape stores room_transfer note prefix', () => {
    const note = buildRoomTransferMeterLogNote('req-1');
    assert.match(note, /^room_transfer:req-1$/);
  });

  test('reading cannot regress below baseline', () => {
    const bad = validateTransferReadingAgainstBaseline({ readingUnits: 400, baselineUnits: 450 });
    assert.equal(bad.ok, false);
    const ok = validateTransferReadingAgainstBaseline({ readingUnits: 450, baselineUnits: 450 });
    assert.equal(ok.ok, true);
  });

  test('admin meter photo uses dedicated proxy route', () => {
    assert.equal(adminMeterLogImageUrl('ml-1'), '/api/admin/meter-log/ml-1/image');
  });

  test('server enforces cross-room gate in applyResidentBedTransfer', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/roomTransferTenancy.ts'),
      'utf8',
    );
    assert.match(src, /assertTransferMeterEvidenceForBedMove/);
    assert.match(src, /skipTransferMeterEvidence/);
  });

  test('tryComplete uses applyResidentBedTransfer with roomChangeRequestId', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/roomTransferLifecycle.ts'),
      'utf8',
    );
    assert.match(src, /roomChangeRequestId: row\.id/);
  });

  test('submit defers completion for cross-room until meter', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(customer)/account/resident/room-change-actions.ts'),
      'utf8',
    );
    assert.match(src, /crossRoomTransferRequired/);
    assert.match(src, /requiresTransferMeterEvidence/);
    assert.match(src, /submitRoomChangeTransferMeterEvidence/);
  });

  test('meter log uses room_transfer reading type', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/roomTransfer/roomChangeTransferMeterEvidence.ts'),
      'utf8',
    );
    assert.match(src, /readingType: 'room_transfer'/);
  });

  test('admin electricity preview loads transfer evidence', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/billing/pgElectricityGenerationPreview.ts'),
      'utf8',
    );
    assert.match(src, /loadRoomTransferMeterEvidenceForRoomMonth/);
    assert.match(src, /transferEvidenceRows/);
  });

  test('checklist UI shows transfer meter photo link', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/admin/electricity/PgElectricityBillingChecklist.tsx'),
      'utf8',
    );
    assert.match(src, /transferEvidence/);
    assert.match(src, /View transfer meter photo/);
  });

  test('resident flow includes meter step', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/requests/RoomChangeFlow.tsx'),
      'utf8',
    );
    assert.match(src, /step === 'meter'/);
    assert.match(src, /submitRoomChangeTransferMeterAction/);
  });

  test('occupancy reconciliation skips meter gate', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/roomTransfer/occupancyReconciliation.ts'),
      'utf8',
    );
    assert.match(src, /skipTransferMeterEvidence: true/);
  });

  test('checkout meter timeline remains separate from room_transfer', () => {
    const checkout = readFileSync(
      join(process.cwd(), 'src/services/meterTimelineService.ts'),
      'utf8',
    );
    assert.match(checkout, /readingType: 'checkout'/);
    const transfer = readFileSync(
      join(process.cwd(), 'src/lib/roomTransfer/roomChangeTransferMeterEvidence.ts'),
      'utf8',
    );
    assert.doesNotMatch(transfer, /readingType: 'checkout'/);
  });

  test('schema adds transfer_meter_log_id and enum value', () => {
    const sql = readFileSync(
      join(process.cwd(), 'src/db/migrations/0153_room_change_transfer_meter.sql'),
      'utf8',
    );
    assert.match(sql, /room_transfer/);
    assert.match(sql, /transfer_meter_log_id/);
  });

  test('verified prior collections path unchanged for room transfer task', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/billing/electricityVerifiedPriorCollections.ts'),
      'utf8',
    );
    assert.match(src, /loadVerifiedPriorElectricityCollectionsForMonth/);
    assert.doesNotMatch(src, /room_transfer/);
  });
});
