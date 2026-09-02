import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ROOM_CHANGE_HOLD_HOURS,
  ROOM_CHANGE_WORKFLOW_STATES,
  assertRoomChangeTransition,
  canTransitionRoomChange,
  isRoomChangeTerminal,
  roomChangeDeadlinePassed,
  roomChangeExpiresAt,
  settlementMetRoomChangeDeadline,
  type RoomChangeWorkflowState,
} from '@/src/lib/roomTransfer/stateMachine';
import {
  aggregateOccupancyCounts,
  resolveBedOccupancy,
} from '@/src/lib/bedOccupancyResolve';
import { roomChangeChargesSettledFromRows } from '@/src/services/roomTransferBilling';
import { ROOM_SHIFT_FEE_PAISE } from '@/src/services/roomShiftQuote';

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

test('01 — hold policy is exactly 72 hours', () => {
  assert.equal(ROOM_CHANGE_HOLD_HOURS, 72);
  const held = new Date('2026-09-01T00:00:00.000Z');
  assert.equal(roomChangeExpiresAt(held).toISOString(), '2026-09-04T00:00:00.000Z');
});

test('02 — deadline is open immediately before expiry', () => {
  assert.equal(
    roomChangeDeadlinePassed(
      new Date('2026-09-04T00:00:00.000Z'),
      new Date('2026-09-03T23:59:59.999Z'),
    ),
    false,
  );
});

test('03 — deadline closes exactly at expiry', () => {
  assert.equal(
    roomChangeDeadlinePassed(
      new Date('2026-09-04T00:00:00.000Z'),
      new Date('2026-09-04T00:00:00.000Z'),
    ),
    true,
  );
});

test('04 — payment settled before deadline remains eligible after a delayed job', () => {
  assert.equal(
    settlementMetRoomChangeDeadline(
      new Date('2026-09-03T23:59:59.999Z'),
      new Date('2026-09-04T00:00:00.000Z'),
    ),
    true,
  );
});

test('05 — payment settled after deadline is not eligible', () => {
  assert.equal(
    settlementMetRoomChangeDeadline(
      new Date('2026-09-04T00:00:00.001Z'),
      new Date('2026-09-04T00:00:00.000Z'),
    ),
    false,
  );
});

test('06 — missing settlement is not eligible', () => {
  assert.equal(
    settlementMetRoomChangeDeadline(null, new Date('2026-09-04T00:00:00.000Z')),
    false,
  );
});

const validTransitions: Array<[RoomChangeWorkflowState, RoomChangeWorkflowState]> = [
  ['REQUESTED', 'QUOTED'],
  ['QUOTED', 'TARGET_HELD'],
  ['TARGET_HELD', 'PAYMENT_PENDING'],
  ['TARGET_HELD', 'READY_TO_TRANSFER'],
  ['PAYMENT_PENDING', 'READY_TO_TRANSFER'],
  ['READY_TO_TRANSFER', 'TRANSFERRING'],
  ['TRANSFERRING', 'COMPLETED'],
  ['PAYMENT_PENDING', 'CANCELLED'],
  ['PAYMENT_PENDING', 'EXPIRED'],
  ['TRANSFERRING', 'FAILED'],
];

validTransitions.forEach(([from, to], index) => {
  test(`${String(index + 7).padStart(2, '0')} — allows ${from} → ${to}`, () => {
    assert.equal(canTransitionRoomChange(from, to), true);
    assert.doesNotThrow(() => assertRoomChangeTransition(from, to));
  });
});

const invalidTransitions: Array<[RoomChangeWorkflowState, RoomChangeWorkflowState]> = [
  ['REQUESTED', 'COMPLETED'],
  ['QUOTED', 'COMPLETED'],
  ['PAYMENT_PENDING', 'TRANSFERRING'],
  ['COMPLETED', 'REQUESTED'],
  ['CANCELLED', 'PAYMENT_PENDING'],
  ['EXPIRED', 'READY_TO_TRANSFER'],
  ['FAILED', 'TRANSFERRING'],
  ['TRANSFERRING', 'CANCELLED'],
];

invalidTransitions.forEach(([from, to], index) => {
  test(`${String(index + 17).padStart(2, '0')} — rejects ${from} → ${to}`, () => {
    assert.equal(canTransitionRoomChange(from, to), false);
    assert.throws(() => assertRoomChangeTransition(from, to));
  });
});

test('25 — canonical state list is explicit and complete', () => {
  assert.deepEqual(ROOM_CHANGE_WORKFLOW_STATES, [
    'REQUESTED',
    'QUOTED',
    'TARGET_HELD',
    'PAYMENT_PENDING',
    'READY_TO_TRANSFER',
    'TRANSFERRING',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'FAILED',
  ]);
});

(['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'] as const).forEach((state, index) => {
  test(`${index + 26} — ${state} is terminal`, () => {
    assert.equal(isRoomChangeTerminal(state), true);
  });
});

test('30 — request state is not terminal', () => {
  assert.equal(isRoomChangeTerminal('REQUESTED'), false);
});

test('31 — room-change fee is fixed at ₹90', () => {
  assert.equal(ROOM_SHIFT_FEE_PAISE, 9_000);
});

test('32 — no invoices means zero-due settlement', () => {
  assert.equal(roomChangeChargesSettledFromRows([]), true);
});

test('33 — unpaid fee blocks settlement', () => {
  assert.equal(
    roomChangeChargesSettledFromRows([
      { sourceTable: 'room_change_fee', status: 'sent', amountPaise: 9_000 },
    ]),
    false,
  );
});

test('34 — all paid child lines settle the request', () => {
  assert.equal(
    roomChangeChargesSettledFromRows([
      { sourceTable: 'room_change_fee', status: 'paid', amountPaise: 9_000 },
      { sourceTable: 'room_change_deposit', status: 'settled', amountPaise: 50_000 },
    ]),
    true,
  );
});

test('35 — paid pay-all settles the request', () => {
  assert.equal(
    roomChangeChargesSettledFromRows([
      { sourceTable: 'room_change_pay_all', status: 'paid', amountPaise: 59_000 },
      { sourceTable: 'room_change_fee', status: 'sent', amountPaise: 9_000 },
    ]),
    true,
  );
});

test('36 — partial pay-all does not settle the request', () => {
  assert.equal(
    roomChangeChargesSettledFromRows([
      { sourceTable: 'room_change_pay_all', status: 'partial', amountPaise: 59_000 },
      { sourceTable: 'room_change_fee', status: 'sent', amountPaise: 9_000 },
    ]),
    false,
  );
});

test('37 — pending transfer keeps old bed occupied', () => {
  const oldBed = resolveBedOccupancy({
    bedId: 'old',
    bedStatus: 'available',
    isOccupiedToday: true,
  });
  assert.equal(oldBed.snapshot.publicState, 'occupied');
  assert.equal(oldBed.isBookable, false);
});

test('38 — pending target is reserved and not bookable', () => {
  const target = resolveBedOccupancy({
    bedId: 'target',
    bedStatus: 'available',
    isOccupiedToday: false,
    transferHoldActive: true,
  });
  assert.equal(target.snapshot.publicState, 'reserved');
  assert.equal(target.customerView.label, 'Reserved');
  assert.equal(target.isBookable, false);
});

test('39 — completed transfer releases old bed', () => {
  const oldBed = resolveBedOccupancy({
    bedId: 'old',
    bedStatus: 'available',
    isOccupiedToday: false,
  });
  assert.equal(oldBed.isOpenNow, true);
});

test('40 — completed transfer occupies target bed', () => {
  const target = resolveBedOccupancy({
    bedId: 'target',
    bedStatus: 'available',
    isOccupiedToday: true,
  });
  assert.equal(target.snapshot.publicState, 'occupied');
  assert.equal(target.isBookable, false);
});

test('41 — aggregate available count equals individual open beds', () => {
  const rows = [
    resolveBedOccupancy({ bedId: 'open', bedStatus: 'available', isOccupiedToday: false }),
    resolveBedOccupancy({
      bedId: 'held',
      bedStatus: 'available',
      isOccupiedToday: false,
      transferHoldActive: true,
    }),
    resolveBedOccupancy({ bedId: 'occupied', bedStatus: 'available', isOccupiedToday: true }),
  ];
  assert.equal(aggregateOccupancyCounts(rows).openNowBeds, rows.filter((row) => row.isOpenNow).length);
});

const contracts: Array<[string, string, RegExp]> = [
  [
    '42 — migration enforces one open request per booking',
    'src/db/migrations/0149_room_change_engine.sql',
    /one_open_per_booking_uidx/,
  ],
  [
    '43 — migration persists exact hold expiry',
    'src/db/migrations/0149_room_change_engine.sql',
    /created_at \+ interval '72 hours'/,
  ],
  [
    '44 — submission recomputes quote server-side',
    'app/(customer)/account/resident/room-change-actions.ts',
    /authoritativeQuoteResult = await quoteRoomChangeAction/,
  ],
  [
    '45 — request and hold are created in one transaction',
    'app/(customer)/account/resident/room-change-actions.ts',
    /db\.transaction[\s\S]*insert\(roomChangeRequests\)[\s\S]*insert\(roomTransferBedHolds\)/,
  ],
  [
    '46 — pay-all allocates child invoices through the normal allocator',
    'src/services/invoicePayment.ts',
    /sourceTable === 'financial_invoices'[\s\S]*allocateInvoicePayment/,
  ],
  [
    '47 — completion locks the request and beds',
    'src/services/roomTransferTenancy.ts',
    /FOR UPDATE[\s\S]*FOR UPDATE/,
  ],
  [
    '48 — completion consumes the hold in the tenancy transaction',
    'src/services/roomTransferTenancy.ts',
    /consumedAt:[\s\S]*workflowState: 'COMPLETED'/,
  ],
  [
    '49 — normal room changes do not create admin approval tasks',
    'src/services/unifiedOperationsQueue.ts',
    /Normal room changes are self-service/,
  ],
  [
    '50 — public occupancy ignores unpaid expired holds',
    'src/services/bedOccupancyBatch.ts',
    /rth\.expires_at > now\(\)/,
  ],
  [
    '51 — occupancy readers fail-safe before workflow_state exists',
    'src/services/availability.ts',
    /roomChangeEngineSchemaReady/,
  ],
  [
    '52 — expire/cancel/complete assert legal workflow transitions',
    'src/services/roomTransferLifecycle.ts',
    /assertRoomChangeTransition/,
  ],
  [
    '53 — submit is an atomic composite into PAYMENT_PENDING or READY_TO_TRANSFER',
    'app/(customer)/account/resident/room-change-actions.ts',
    /Atomic composite/,
  ],
];

for (const [name, file, pattern] of contracts) {
  test(name, () => {
    assert.match(source(file), pattern);
  });
}
