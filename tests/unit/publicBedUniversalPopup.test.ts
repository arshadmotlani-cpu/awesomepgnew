/**
 * Public bed interaction: every bed clickable; universal detail sheet;
 * Book/Hold gated by availability SSOT only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  PUBLIC_BED_BILLING_CYCLE_LABEL,
  publicBedStatusTitle,
} from '@/src/components/customer/customerBedUi';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('CustomerBedTile never disables beds for occupancy — always clickable', () => {
  const ui = read('src/components/customer/customerBedUi.tsx');
  const tileFn = ui.slice(ui.indexOf('export function CustomerBedTile'));
  const tileBody = tileFn.slice(0, tileFn.indexOf('export function CustomerBedDetailSheet'));
  assert.match(tileBody, /disabled=\{false\}/);
  assert.doesNotMatch(tileBody, /disabled=\{!bookable/);
  assert.doesNotMatch(tileBody, /pointer-events-none/);
});

test('BedStateTile uses cursor-pointer for interactive beds', () => {
  const tile = read('src/components/customer/design-system/BedStateTile.tsx');
  assert.match(tile, /cursor-pointer/);
});

test('universal popup is a single CustomerBedDetailSheet for all states', () => {
  const ui = read('src/components/customer/customerBedUi.tsx');
  assert.match(ui, /export function CustomerBedDetailSheet/);
  assert.match(ui, /AVAILABLE NOW/);
  assert.match(ui, /ON NOTICE/);
  assert.match(ui, /MAINTENANCE/);
  assert.match(ui, /RESERVED/);
  assert.match(ui, /OCCUPIED/);
  assert.match(ui, /Monthly rent/);
  assert.match(ui, /Security deposit/);
  assert.match(ui, /PUBLIC_BED_BILLING_CYCLE_LABEL/);
  assert.match(ui, /displayMonthlyDepositPaise/);
  assert.match(ui, /canBookBed\(bed\)/);
  assert.doesNotMatch(ui, /occupantFirstName|customerPhone|fullName/);
});

test('billing cycle copy is 1st-of-month calendar billing', () => {
  assert.equal(PUBLIC_BED_BILLING_CYCLE_LABEL, 'Rent billed on the 1st of every month.');
  const ui = read('src/components/customer/customerBedUi.tsx');
  assert.match(ui, /Rent billed on the 1st of every month/);
  assert.doesNotMatch(ui, /anniversary billing|anniversary rent/i);
});

test('publicBedStatusTitle maps SSOT kinds without inventing availability', () => {
  assert.equal(publicBedStatusTitle('open_now'), 'AVAILABLE NOW');
  assert.equal(publicBedStatusTitle('notice'), 'ON NOTICE');
  assert.equal(publicBedStatusTitle('maintenance'), 'MAINTENANCE');
  assert.equal(publicBedStatusTitle('reserved'), 'RESERVED');
  assert.equal(publicBedStatusTitle('occupied'), 'OCCUPIED');
  assert.equal(publicBedStatusTitle('booked'), 'RESERVED');
  assert.equal(publicBedStatusTitle('pre_bookable'), 'AVAILABLE SOON');
});

test('unavailable beds show disabled Book and Hold CTAs — not dead tiles', () => {
  const ui = read('src/components/customer/customerBedUi.tsx');
  assert.match(ui, /aria-disabled/);
  assert.match(ui, /Not available for booking while occupied/);
  assert.match(ui, /Not currently available/);
  assert.match(ui, /Available from \$\{input\.opensDateLabel\}/);
  assert.match(ui, /Available from:/);
  assert.match(ui, /HOLD_THIS_BED\} — 50% rent/);
  assert.match(ui, /BOOK_THIS_BED/);
});

test('available bookable path keeps enabled Book and Hold (50%)', () => {
  const ui = read('src/components/customer/customerBedUi.tsx');
  assert.match(ui, /showEnabledBookHold/);
  assert.match(ui, /data-roachie-bed-action="book"/);
  assert.match(ui, /data-roachie-bed-action="reserve"/);
  assert.match(ui, /onBook\(\)/);
  assert.match(ui, /onReserve/);
});

test('notice beds keep Hold (plan move-in) and disable Book / 50% Hold when not bookable', () => {
  const ui = read('src/components/customer/customerBedUi.tsx');
  assert.match(ui, /: isNotice \? \(/);
  assert.match(ui, /data-roachie-bed-action="pre-book"/);
  assert.match(ui, /plans your move-in when this bed opens/);
});

test('notice availability date uses vacating SSOT — not a local invent', () => {
  const ui = read('src/components/customer/customerBedUi.tsx');
  assert.match(ui, /bedAvailableCalendarDate\(bed\.vacatingDate\)/);
  assert.match(ui, /deriveCustomerBedAvailabilityView/);
  assert.match(ui, /resolveBedOccupancy/);
  assert.doesNotMatch(
    ui,
    /function computeAvailability|recalculateAvailability|inventAvailableFrom/,
  );
});

test('parents open the same universal sheet — no second popup', () => {
  const selector = read('src/components/customer/BedSelector.tsx');
  const block = read('src/components/customer/block/PgBlockBooking.tsx');
  const map = read('src/components/customer/CustomerBedMap.tsx');
  for (const src of [selector, block, map]) {
    assert.match(src, /CustomerBedDetailSheet/);
    assert.match(src, /CustomerBedTile/);
    assert.doesNotMatch(src, /OccupiedBedModal|MaintenanceBedPopup|NoticeOnlySheet/);
  }
});

test('canonical booking and 50% hold panels remain wired', () => {
  const selector = read('src/components/customer/BedSelector.tsx');
  assert.match(selector, /BedBookingPanel/);
  assert.match(selector, /BedReservePanel/);
  assert.match(selector, /onBook/);
  assert.match(selector, /onReserve/);
});

test('desktop center + mobile bottomSheet presentations both exist', () => {
  const ui = read('src/components/customer/customerBedUi.tsx');
  assert.match(ui, /presentation === 'bottomSheet'/);
  assert.match(ui, /MobileBottomSheet/);
  assert.match(ui, /sm:items-center/);
  assert.match(ui, /items-end/);
});
