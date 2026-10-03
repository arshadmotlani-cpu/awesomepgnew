import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  electricityBillingInventoryIncludesNonArchivedRooms,
  electricityBillingInventoryMustNotFilterByAc,
} from '@/src/lib/billing/pgElectricityBillingRoomInventoryPure';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('PG electricity billing room inventory (no AC gate)', () => {
  test('checklist inventory must not filter by has_ac', () => {
    const checklist = read('src/lib/billing/pgElectricityBillingChecklist.ts');
    const inventory = read('src/lib/billing/pgElectricityBillingRoomInventory.ts');
    assert.equal(electricityBillingInventoryMustNotFilterByAc(checklist), true);
    assert.equal(electricityBillingInventoryMustNotFilterByAc(inventory), true);
    assert.doesNotMatch(checklist, /eq\(roomTypes\.hasAc,\s*true\)/);
    assert.match(checklist, /listPgRoomsForElectricityBillingInventory/);
  });

  test('inventory includes non-archived rooms only', () => {
    const inventory = read('src/lib/billing/pgElectricityBillingRoomInventory.ts');
    assert.equal(electricityBillingInventoryIncludesNonArchivedRooms(inventory), true);
  });

  test('readings-without-bills audit must not filter by has_ac', () => {
    const audit = read('src/lib/billing/electricityReadingsWithoutBills.ts');
    assert.equal(electricityBillingInventoryMustNotFilterByAc(audit), true);
    assert.match(audit, /r\.archived_at IS NULL/);
    assert.doesNotMatch(audit, /has_ac = true/);
  });

  test('fleet status derives from checklist inventory (shared SSOT)', () => {
    const fleet = read('src/lib/billing/fleetElectricityBillingStatus.ts');
    assert.match(fleet, /loadPgElectricityBillingChecklist/);
    assert.doesNotMatch(fleet, /has_ac/);
  });

  test('September certification uses fleet checklist inventory', () => {
    const cert = read('src/services/september2026ElectricityCertification.ts');
    assert.match(cert, /loadFleetElectricityBillingSummary/);
    assert.doesNotMatch(cert, /has_ac = true/);
  });

  test('non-AC room with occupants uses reading_required path in checklist', () => {
    const checklist = read('src/lib/billing/pgElectricityBillingChecklist.ts');
    assert.match(checklist, /billableOccupantCount === 0/);
    assert.match(checklist, /status: 'not_eligible'/);
    assert.match(checklist, /status: 'reading_required'/);
  });

  test('maintenance room path unchanged', () => {
    const checklist = read('src/lib/billing/pgElectricityBillingChecklist.ts');
    assert.match(checklist, /physicalActiveBedCount === 0/);
    assert.match(checklist, /status: 'maintenance_excluded'/);
  });

  test('createElectricityBill remains single generation path', () => {
    const actions = read('app/(admin)/admin/billing/electricity/generate/actions.ts');
    assert.match(actions, /createElectricityBill/);
    assert.doesNotMatch(actions, /has_ac/);
  });

  test('Room 203 is not special-cased by room number', () => {
    const checklist = read('src/lib/billing/pgElectricityBillingChecklist.ts');
    const inventory = read('src/lib/billing/pgElectricityBillingRoomInventory.ts');
    assert.doesNotMatch(checklist, /203/);
    assert.doesNotMatch(inventory, /203/);
  });

  test('has_ac retained as metadata on inventory row only', () => {
    const inventory = read('src/lib/billing/pgElectricityBillingRoomInventory.ts');
    assert.match(inventory, /hasAc: roomTypes\.hasAc/);
    assert.doesNotMatch(inventory, /eq\(roomTypes\.hasAc/);
  });
});
