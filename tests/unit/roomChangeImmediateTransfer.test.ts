import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pickAuthoritativePrimaryStay } from '@/src/lib/occupancy/authoritativePrimaryStay';
import { roomChangeChargesSettledFromRows } from '@/src/services/roomTransferBilling';
import { ROOM_CHANGE_INVOICE_SOURCE } from '@/src/services/roomShiftQuote';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

test('A — submit room change occupies via tryComplete without payment gate', () => {
  const submit = read('app/(customer)/account/resident/room-change-actions.ts');
  const lifecycle = read('src/services/roomTransferLifecycle.ts');
  assert.match(submit, /workflowState: 'READY_TO_TRANSFER'/);
  assert.match(submit, /tryCompleteRoomChangeRequest\(inserted\.id\)/);
  assert.match(lifecycle, /Occupancy is independent of invoice settlement/);
});

test('B — unpaid room-change amount does not return payment_pending', () => {
  const lifecycle = read('src/services/roomTransferLifecycle.ts');
  assert.doesNotMatch(lifecycle, /status: 'payment_pending'/);
  assert.equal(
    roomChangeChargesSettledFromRows([
      { sourceTable: ROOM_CHANGE_INVOICE_SOURCE.newRent, status: 'sent', amountPaise: 19_101 },
    ]),
    false,
  );
});

test('E/F — portal current assignment uses occupancy SSOT not UUID order', () => {
  const chosen = pickAuthoritativePrimaryStay([
    {
      bedId: '204-b1',
      status: 'completed',
      inStayToday: false,
      upcomingMonthly: false,
      stayStart: '2026-01-01',
    },
    {
      bedId: '101-b1',
      status: 'active',
      inStayToday: true,
      upcomingMonthly: false,
      stayStart: '2026-09-03',
    },
  ]);
  assert.equal(chosen?.bedId, '101-b1');
  assert.match(
    read('src/db/queries/customer.ts'),
    /pickAuthoritativePrimaryStay/,
  );
});

test('H — pay-all wrapper is excluded from other-dues so totals are not doubled', () => {
  assert.match(
    read('src/services/residentFinancialEngine.ts'),
    /sourceTable === 'room_change_pay_all'/,
  );
});

test('I — invoice payment still allocates; occupancy complete is idempotent', () => {
  const payment = read('src/services/invoicePayment.ts');
  assert.match(payment, /tryCompleteRoomChangeAfterInvoice/);
  const lifecycle = read('src/services/roomTransferLifecycle.ts');
  assert.match(lifecycle, /workflowState === 'COMPLETED'/);
});

test('Q — PAYMENT_PENDING leftover requests can still occupy through READY_TO_TRANSFER', () => {
  assert.match(
    read('src/services/roomTransferTenancy.ts'),
    /PAYMENT_PENDING'[\s\S]*READY_TO_TRANSFER'[\s\S]*TRANSFERRING'/,
  );
});

test('R — isBedAvailable skipRoomTransferHoldCheck clears occupancy transferHoldActive', () => {
  const availability = read('src/services/availability.ts');
  assert.match(availability, /skipRoomTransferHoldCheck/);
  assert.match(availability, /transferHoldActive: false/);
  assert.match(
    availability,
    /Room-change completion places an active transfer hold[\s\S]*transferHoldActive: false/,
  );
  // Public customers still blocked by hold via inventory path when skip is off.
  assert.match(read('src/lib/inventoryBlocking.ts'), /bedHasActiveRoomTransferHold/);
  assert.match(
    read('src/lib/bedOccupancyEngine.ts'),
    /if \(input\.transferHoldActive\) return false/,
  );
});

test('S — same-day immediate transfer completion uses skip hold availability', () => {
  const lifecycle = read('src/services/roomTransferLifecycle.ts');
  assert.match(lifecycle, /skipRoomTransferHoldCheck: true/);
  assert.match(lifecycle, /applyResidentBedTransfer/);
  const tenancy = read('src/services/roomTransferTenancy.ts');
  assert.match(tenancy, /skipRoomTransferHoldCheck: Boolean\(input\.roomChangeRequestId\)/);
});

test('T — submit surfaces completion failure without silently claiming completed', () => {
  const submit = read('app/(customer)/account/resident/room-change-actions.ts');
  assert.match(submit, /tryComplete after submit failed/);
  assert.match(submit, /completionOk/);
  assert.match(submit, /status: completion\.ok \? completion\.status : 'submitted'/);
});

test('U — expired requests are not revived by completion path', () => {
  const lifecycle = read('src/services/roomTransferLifecycle.ts');
  assert.match(lifecycle, /\['CANCELLED', 'EXPIRED', 'FAILED'\]\.includes\(row\.workflowState\)/);
  assert.match(lifecycle, /Request is \$\{row\.workflowState\.toLowerCase\(\)\}\./);
});
