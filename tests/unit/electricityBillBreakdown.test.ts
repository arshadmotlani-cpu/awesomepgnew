import test from 'node:test';
import assert from 'node:assert/strict';
import { buildElectricityBillBreakdownFromContext } from '@/src/lib/billing/buildElectricityBillBreakdown';
import type { RoomElectricityTimelineRow } from '@/src/lib/billing/roomElectricityTimeline';

/**
 * Room 204 June 2026 — transparent breakdown certification scenario.
 * 188 units @ ₹16 = ₹3,008 gross.
 * Resident A: ₹500 collected at checkout (vacated 10 Jun).
 * Resident B: ₹250 deposit + ₹1,200 checkout = ₹1,450 settled (vacated 28 Jun).
 * Resident C: owes remaining ₹1,308.
 */
test('room 204 breakdown shows prior collections and remaining balance for active resident', () => {
  const grossTotalPaise = 188 * 1_600; // 300_800
  const timelineRows: RoomElectricityTimelineRow[] = [
    {
      bookingId: 'a',
      customerId: 'cust-a',
      customerName: 'Resident A',
      reservationStatus: 'completed',
      bookingStatus: 'confirmed',
      lower: '2026-06-01',
      upper: '2026-06-11',
      activeDays: 10,
      stayStart: '2026-06-01',
      stayEnd: '2026-06-10',
      vacatedOn: '2026-06-10',
      role: 'departed',
      settlement: {
        electricitySharePaise: 50_000,
        recoveredFromDepositPaise: 0,
        collectedDuringCheckoutPaise: 50_000,
        creditAppliedToRoomBillPaise: 50_000,
        ledgerAmountPaise: 50_000,
      },
    },
    {
      bookingId: 'b',
      customerId: 'cust-b',
      customerName: 'Resident B',
      reservationStatus: 'completed',
      bookingStatus: 'confirmed',
      lower: '2026-06-01',
      upper: '2026-06-29',
      activeDays: 28,
      stayStart: '2026-06-01',
      stayEnd: '2026-06-28',
      vacatedOn: '2026-06-28',
      role: 'departed',
      settlement: {
        electricitySharePaise: 145_000,
        recoveredFromDepositPaise: 25_000,
        collectedDuringCheckoutPaise: 120_000,
        creditAppliedToRoomBillPaise: 120_000,
        ledgerAmountPaise: 120_000,
      },
    },
    {
      bookingId: 'c',
      customerId: 'cust-c',
      customerName: 'Resident C',
      reservationStatus: 'active',
      bookingStatus: 'confirmed',
      lower: '2026-06-01',
      upper: null,
      activeDays: 30,
      stayStart: '2026-06-01',
      stayEnd: '2026-06-30',
      vacatedOn: null,
      role: 'active',
      settlement: null,
    },
  ];

  const invoiceAmountByBookingId = new Map([['c', 130_800]]);

  const breakdown = buildElectricityBillBreakdownFromContext({
    roomNumber: '204',
    billingMonth: '2026-06-01',
    previousReadingUnits: 654,
    currentReadingUnits: 842,
    ratePerUnitPaise: 1_600,
    grossTotalPaise,
    prepaidCreditPaise: 0,
    manualCreditPaise: 0,
    checkoutCreditAppliedPaise: 170_000,
    remainingBillPaise: 130_800,
    useProRata: true,
    timelineRows,
    invoiceAmountByBookingId,
    checkoutCredits: [
      {
        customerId: 'cust-a',
        customerName: 'Resident A',
        amountPaise: 50_000,
        recoveredFromDepositPaise: 0,
        collectedDuringCheckoutPaise: 50_000,
      },
      {
        customerId: 'cust-b',
        customerName: 'Resident B',
        amountPaise: 120_000,
        recoveredFromDepositPaise: 25_000,
        collectedDuringCheckoutPaise: 120_000,
      },
    ],
  });

  assert.equal(breakdown.meter.grossTotalPaise, 300_800);
  assert.equal(breakdown.remainingBillPaise, 130_800);
  assert.equal(breakdown.adjustments.checkoutCredits.length, 2);

  const residentA = breakdown.timeline.find((t) => t.customerId === 'cust-a');
  const residentB = breakdown.timeline.find((t) => t.customerId === 'cust-b');
  const residentC = breakdown.timeline.find((t) => t.customerId === 'cust-c');

  assert.equal(residentA?.collectedDuringCheckoutPaise, 50_000);
  assert.equal(residentB?.recoveredFromDepositPaise, 25_000);
  assert.equal(residentB?.collectedDuringCheckoutPaise, 120_000);
  assert.equal(residentC?.monthlyInvoiceAmountPaise, 130_800);
  assert.equal(residentC?.role, 'active');
});
