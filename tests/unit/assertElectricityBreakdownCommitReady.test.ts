/**
 * Breakdown commit gate — unexplained financial bills must not commit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertElectricityBreakdownCommitReady,
  ElectricityBreakdownCommitError,
} from '@/src/lib/billing/assertElectricityBreakdownCommitReady';
import { buildElectricityBillBreakdownFromContext } from '@/src/lib/billing/electricityBillBreakdownPure';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { billingMonthCalendarDays } from '@/src/lib/billing/roomElectricityOccupancyCoverage';

const month = '2026-08-01';
const days = billingMonthCalendarDays(month);

test('valid v2 breakdown passes commit gate and conserves gross', () => {
  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 3100,
    prepaidCreditPaise: 0,
    occupants: [
      {
        bookingId: 'b1',
        customerId: 'c1',
        bedCount: 1,
        weight: 31,
        occupiedDates: days,
      },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: 1,
    billingDays: days,
  });

  const invoiceAmountByBookingId = new Map(
    allocation.invoices.map((line) => [line.bookingId, line.amountPaise]),
  );
  const invoiceTotalPaise = [...invoiceAmountByBookingId.values()].reduce((a, b) => a + b, 0);

  const breakdown = buildElectricityBillBreakdownFromContext({
    roomNumber: '204',
    billingMonth: month,
    previousReadingUnits: 100,
    currentReadingUnits: 131,
    ratePerUnitPaise: 100,
    grossTotalPaise: 3100,
    prepaidCreditPaise: 0,
    manualCreditPaise: 0,
    checkoutCreditAppliedPaise: 0,
    remainingBillPaise: invoiceTotalPaise,
    useProRata: true,
    timelineRows: [
      {
        bookingId: 'b1',
        customerId: 'c1',
        customerName: 'Resident A',
        reservationStatus: 'active',
        bookingStatus: 'confirmed',
        lower: month,
        upper: null,
        activeDays: 31,
        stayStart: month,
        stayEnd: null,
        vacatedOn: null,
        role: 'active',
        occupiedDates: days,
        intervals: [{ startDate: month, endDateExclusive: '2026-09-01' }],
      },
    ],
    invoiceAmountByBookingId,
    checkoutCredits: [],
    calculatedShareByCustomerId: allocation.calculatedShareByCustomerId,
    contributionAppliedByCustomerId: allocation.contributionAppliedByCustomerId,
    dailyAllocation: allocation.dailyAllocation,
    emptyDayPaise: allocation.emptyDayPaise,
    dailyRoundingRemainderPaise: allocation.dailyRoundingRemainderPaise,
  });

  assert.equal(breakdown.version, 2);
  assert.equal(breakdown.conservation?.accountedTotalPaise, 3100);
  assert.equal(breakdown.conservation?.invoiceTotalPaise, invoiceTotalPaise);
  assert.doesNotThrow(() =>
    assertElectricityBreakdownCommitReady({
      breakdown,
      grossTotalPaise: 3100,
      invoiceTotalPaise,
    }),
  );
});

test('breakdown composition failure rejects commit gate', () => {
  assert.throws(
    () =>
      assertElectricityBreakdownCommitReady({
        breakdown: {
          version: 2,
          roomNumber: '204',
          billingMonth: month,
          meter: {
            previousReadingUnits: 0,
            currentReadingUnits: 10,
            unitsConsumed: 10,
            ratePerUnitPaise: 100,
            grossTotalPaise: 999,
          },
          adjustments: {
            prepaidCreditPaise: 0,
            prepaidCreditNote: null,
            checkoutCredits: [],
            manualCreditPaise: 0,
            totalDeductedPaise: 0,
          },
          previousContributions: [],
          remainingBillPaise: 0,
          useProRata: true,
          timeline: [],
          conservation: {
            residentCalculatedSharesPaise: 0,
            contributionAppliedPaise: 0,
            invoiceTotalPaise: 0,
            emptyDayPaise: 0,
            dailyRoundingRemainderPaise: 0,
            accountedTotalPaise: 0,
          },
          generatedAt: new Date().toISOString(),
        },
        grossTotalPaise: 1000,
        invoiceTotalPaise: 0,
      }),
    (err: unknown) => err instanceof ElectricityBreakdownCommitError,
  );
});

test('createElectricityBill composes breakdown before financial insert and fails closed', async () => {
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync('src/services/electricityBilling.ts', 'utf8'),
  );
  const composeIdx = source.indexOf('composeElectricityBillBreakdown');
  const insertIdx = source.indexOf('insert(electricityBills)');
  const precommitIdx = source.indexOf('calculation_breakdown_precommit');
  assert.ok(composeIdx > 0 && insertIdx > composeIdx, 'breakdown must compose before bill insert');
  assert.ok(precommitIdx > 0, 'breakdown failure must be logged as precommit');
  assert.match(source, /kind: 'breakdown_failed'/);
  assert.match(source, /calculationBreakdown,/);
  assert.doesNotMatch(source, /step: 'calculation_breakdown_in_tx'/);
});
