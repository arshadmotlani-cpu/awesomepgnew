import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  dedupeOpsTasks,
  verifyOperationsCenterCounts,
  OPERATIONS_CENTER_CARD_ROUTES,
} from '../../src/lib/operationsCenterAudit';
import {
  comparePriority,
  depositRefundPriority,
  electricityPriority,
  formatPgDisplayName,
  isWithinDays,
  kycPriority,
  ps4RenewalPriority,
  reservationPriority,
  vacatingPriority,
} from '../../src/lib/operationsCenterRules';
import { buildOperationsTasks } from '../../src/services/operationsCenter';

test('formatPgDisplayName appends AWESOME PG suffix', () => {
  assert.equal(formatPgDisplayName('Shantinagar'), 'SHANTINAGAR - AWESOME PG');
  assert.equal(
    formatPgDisplayName('TRIMURTI NAGAR - AWESOME PG'),
    'TRIMURTI NAGAR - AWESOME PG',
  );
});

test('vacatingPriority escalates as vacating date nears', () => {
  assert.equal(vacatingPriority(3), 'red');
  assert.equal(vacatingPriority(10), 'orange');
  assert.equal(vacatingPriority(20), 'green');
});

test('kycPriority escalates with wait time', () => {
  const today = '2026-06-12';
  assert.equal(kycPriority(new Date('2026-06-12T10:00:00Z'), today), 'green');
  assert.equal(kycPriority(new Date('2026-06-11T10:00:00Z'), today), 'orange');
  assert.equal(kycPriority(new Date('2026-06-08T10:00:00Z'), today), 'red');
});

test('depositRefundPriority thresholds', () => {
  assert.equal(depositRefundPriority(2), 'green');
  assert.equal(depositRefundPriority(5), 'orange');
  assert.equal(depositRefundPriority(10), 'red');
});

test('electricityPriority uses overdue and due window', () => {
  assert.equal(electricityPriority('overdue', '2026-06-01', '2026-06-12'), 'red');
  assert.equal(electricityPriority('pending', '2026-06-15', '2026-06-12'), 'orange');
  assert.equal(electricityPriority('pending', '2026-06-30', '2026-06-12'), 'green');
});

test('ps4RenewalPriority within 7 days', () => {
  const today = '2026-06-12';
  assert.equal(ps4RenewalPriority(new Date('2026-06-13T00:00:00Z'), today), 'red');
  assert.equal(ps4RenewalPriority(new Date('2026-06-18T00:00:00Z'), today), 'orange');
});

test('reservationPriority flags overdue check-ins', () => {
  assert.equal(reservationPriority('2026-06-10', '2026-06-12'), 'red');
  assert.equal(reservationPriority('2026-06-14', '2026-06-12'), 'orange');
  assert.equal(reservationPriority('2026-06-20', '2026-06-12'), 'green');
});

test('isWithinDays includes dates up to N days ahead', () => {
  assert.equal(isWithinDays('2026-06-20', '2026-06-12', 30), true);
  assert.equal(isWithinDays('2026-07-20', '2026-06-12', 30), false);
});

test('comparePriority sorts red before orange before green', () => {
  assert.ok(comparePriority('red', 'orange') < 0);
  assert.ok(comparePriority('orange', 'green') < 0);
});

test('dedupeOpsTasks removes duplicate ids', () => {
  const out = dedupeOpsTasks([
    { id: 'a', priority: 'red', pgName: 'X', label: 'One', href: '/admin/kyc' },
    { id: 'a', priority: 'orange', pgName: 'X', label: 'Dup', href: '/admin/kyc' },
    { id: 'b', priority: 'green', pgName: 'Y', label: 'Two', href: '/admin/kyc' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.label, 'One');
});

test('verifyOperationsCenterCounts catches count mismatch', () => {
  const errors = verifyOperationsCenterCounts({
    pendingPayments: { count: 2, items: [{}] },
    pendingKyc: { count: 0, items: [] },
    leavingSoon: { count: 0, items: [] },
    bedsReleasingSoon: { count: 0, items: [] },
    upcomingReservations: { count: 0, items: [] },
    refundsPending: { count: 0, items: [] },
    electricityPending: { count: 0, items: [] },
    ps4Renewals: { count: 0, items: [] },
    tasks: [],
  });
  assert.ok(errors.some((e) => e.includes('pendingPayments')));
});

test('buildOperationsTasks uses stable unique ids', () => {
  const today = '2026-06-12';
  const tasks = buildOperationsTasks(
    {
      pendingPayments: {
        count: 1,
        items: [{ key: 'qr-1', pgName: 'A', title: 'Pay', amountPaise: 100 }],
      },
      pendingKyc: { count: 0, items: [] },
      leavingSoon: { count: 0, items: [] },
      bedsReleasingSoon: { count: 0, items: [] },
      upcomingReservations: { count: 0, items: [] },
      refundsPending: { count: 0, items: [] },
      electricityPending: { count: 0, items: [] },
      ps4Renewals: { count: 0, items: [] },
    },
    today,
  );
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]!.id, 'pay-qr-1');
  assert.equal(tasks[0]!.href, OPERATIONS_CENTER_CARD_ROUTES.pendingPayments);
});
