import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveRentBillingOverviewCounts,
  type RentBillingOverviewCounts,
} from '../../src/lib/billing/rentBillingOverview';
import {
  buildPendingCollectionRows,
  serializeBillingCentreDashboardViewForClient,
  type BillingCentreDashboardView,
} from '../../src/lib/admin/billingCentreDashboardPresentation';
import type { RentBillingOverviewRow } from '../../src/services/rentInvoices';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fleetRoomsMissingElectricityFromSummary,
  type FleetElectricityBillingSummary,
} from '../../src/lib/billing/fleetElectricityBillingStatus';

function overviewRow(
  overrides: Partial<RentBillingOverviewRow>,
): RentBillingOverviewRow {
  return {
    bookingId: 'b1',
    bookingCode: 'APG-1',
    customerId: 'c1',
    customerFullName: 'Test',
    customerPhone: '999',
    pgId: 'pg1',
    pgName: 'PG',
    roomNumber: '101',
    bedCode: 'A',
    checkInDate: '2026-10-01',
    expectedRentPaise: 100000,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: 'none',
    rentPaise: 0,
    dueDate: null,
    depositDuePaise: 0,
    depositCollectionStatus: 'collected',
    isDueForGeneration: true,
    roomCapacity: 2,
    roomOccupied: 1,
    roomTypeName: 'Double',
    ...overrides,
  };
}

describe('Billing Center page data boundary', () => {
  it('deriveRentBillingOverviewCounts handles paid, pending, overdue, and cancelled October rows', () => {
    const rows = [
      overviewRow({ bookingId: 'b-paid', invoiceStatus: 'paid', invoiceId: 'i1', isDueForGeneration: false }),
      overviewRow({ bookingId: 'b-pending', invoiceStatus: 'pending', invoiceId: 'i2', isDueForGeneration: false }),
      overviewRow({ bookingId: 'b-overdue', invoiceStatus: 'overdue', invoiceId: 'i3', isDueForGeneration: false }),
      overviewRow({
        bookingId: 'b-cancelled',
        invoiceStatus: 'cancelled',
        invoiceId: 'i4',
        isDueForGeneration: false,
      }),
      overviewRow({ bookingId: 'b-none', invoiceStatus: 'none', isDueForGeneration: true }),
    ];

    const counts: RentBillingOverviewCounts = deriveRentBillingOverviewCounts(rows);
    assert.equal(counts.candidateCount, 5);
    assert.equal(counts.generatedCount, 4);
    assert.equal(counts.pendingCount, 1);
    assert.equal(counts.needsBillCount, 1);
  });

  it('serializeBillingCentreDashboardViewForClient converts Date props for client components', () => {
    const paidAt = new Date('2026-10-02T10:30:00.000Z');
    const reminderAt = new Date('2026-10-01T08:00:00.000Z');

    const pending = buildPendingCollectionRows({
      queueItems: [],
      depositRows: [],
      reminderStats: new Map(),
      todayIso: '2026-10-02',
    });

    const view: BillingCentreDashboardView = {
      todayIso: '2026-10-02',
      summary: {
        collectedTodayPaise: 0,
        collectedTodayCount: 0,
        outstandingPaise: 0,
        upcomingBills7d: 0,
        residentsToRemind: 0,
        pendingApprovals: 0,
        vacatingThisWeek: 0,
      },
      commandCards: [],
      opsKpis: {
        collectedTodayPaise: 0,
        collectedTodayCount: 0,
        outstandingPaise: 0,
        overdueCount: 0,
        pendingPaymentCount: 0,
      },
      upcomingGeneration: [],
      generatedToday: [],
      generatedTodayTotalPaise: 0,
      pendingCollections: [
        {
          ...pending[0],
          kind: 'rent',
          id: 'r1',
          customerId: 'c1',
          customerName: 'Alice',
          customerPhone: '999',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '101',
          bookingId: 'b1',
          invoiceNumber: 'R-1',
          amountPaise: 100,
          dueDate: '2026-10-15',
          daysOverdue: 0,
          priority: 'pending',
          paymentStatus: 'pending',
          financialInvoiceId: null,
          lastReminderSentAt: reminderAt.toISOString(),
          reminderCount: 1,
        },
      ],
      recentlyPaid: [
        {
          id: 'p1',
          kind: 'rent',
          customerId: 'c1',
          customerFullName: 'Alice',
          customerPhone: '999',
          pgName: 'PG',
          roomNumber: '101',
          bedCode: 'A',
          amountPaise: 50000,
          invoiceNumber: 'R-1',
          paymentMode: 'UPI',
          paymentStatus: 'paid',
          paidAt,
        },
      ],
      pendingApprovals: [],
      pgs: [{ id: 'pg1', name: 'PG' }],
    };

    const serialized = serializeBillingCentreDashboardViewForClient({
      ...view,
      pendingCollections: view.pendingCollections.map((r) => ({
        ...r,
        lastReminderSentAt: reminderAt,
      })),
    });

    assert.equal(typeof serialized.recentlyPaid[0]?.paidAt, 'string');
    assert.equal(serialized.recentlyPaid[0]?.paidAt, paidAt.toISOString());
    assert.equal(typeof serialized.pendingCollections[0]?.lastReminderSentAt, 'string');
    assert.equal(
      serialized.pendingCollections[0]?.lastReminderSentAt,
      reminderAt.toISOString(),
    );
  });

  it('Billing Center page loads fleet electricity summary once and derives missing rooms', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/(admin)/admin/billing/page.tsx'),
      'utf8',
    );
    assert.match(page, /fleetElectricitySummaryPromise/);
    assert.doesNotMatch(page, /listRoomsMissingElectricityBill/);
    assert.match(page, /fleetRoomsMissingElectricityFromSummary/);
  });

  it('fleetRoomsMissingElectricityFromSummary filters reading_required and previous_unavailable only', () => {
    const fleet: FleetElectricityBillingSummary = {
      billingMonth: '2026-10-01',
      pgCount: 1,
      totalRooms: 3,
      alreadyBilled: 1,
      needMeterReading: 1,
      needBill: 2,
      maintenanceExcluded: 0,
      notEligible: 0,
      previousUnavailable: 1,
      checklists: [
        {
          billingMonth: '2026-10-01',
          monthLabel: 'October 2026',
          generationDateLabel: '4 October 2026',
          pgId: 'pg1',
          pgName: 'Test PG',
          ratePerUnitPaise: 800,
          rooms: [
            {
              roomId: 'r1',
              roomNumber: '101',
              status: 'already_billed',
              previousReadingUnits: 1,
              previousReadingSource: 'last_monthly_bill',
              previousBillingMonthLabel: 'Oct',
              currentReadingUnits: 2,
              unitsConsumed: 1,
              ratePerUnitPaise: 800,
              billId: 'b1',
              billTotalPaise: 800,
              activeBedCount: 2,
              maintenanceBedCount: 0,
              billableOccupantCount: 0,
              previouslyCollectedPaise: 0,
              occupantsPreview: [],
              transferEvidencePreview: [],
              meterPeriodPreview: null,
              allocationPreview: null,
              settlementPreview: null,
              blockedReason: null,
              requiredBaselineMonthLabel: null,
            },
            {
              roomId: 'r2',
              roomNumber: '102',
              status: 'reading_required',
              previousReadingUnits: 1,
              previousReadingSource: 'last_monthly_bill',
              previousBillingMonthLabel: 'Sep',
              currentReadingUnits: null,
              unitsConsumed: null,
              ratePerUnitPaise: 800,
              billId: null,
              billTotalPaise: null,
              activeBedCount: 2,
              maintenanceBedCount: 0,
              billableOccupantCount: 1,
              previouslyCollectedPaise: 0,
              occupantsPreview: [],
              transferEvidencePreview: [],
              meterPeriodPreview: null,
              allocationPreview: null,
              settlementPreview: null,
              blockedReason: null,
              requiredBaselineMonthLabel: null,
            },
            {
              roomId: 'r3',
              roomNumber: '103',
              status: 'not_eligible',
              previousReadingUnits: null,
              previousReadingSource: null,
              previousBillingMonthLabel: null,
              currentReadingUnits: null,
              unitsConsumed: null,
              ratePerUnitPaise: 800,
              billId: null,
              billTotalPaise: null,
              activeBedCount: 2,
              maintenanceBedCount: 0,
              billableOccupantCount: 0,
              previouslyCollectedPaise: 0,
              occupantsPreview: [],
              transferEvidencePreview: [],
              meterPeriodPreview: null,
              allocationPreview: null,
              settlementPreview: null,
              blockedReason: null,
              requiredBaselineMonthLabel: null,
            },
          ],
          summary: {
            totalRooms: 3,
            alreadyBilled: 1,
            readingRequired: 1,
            previousUnavailable: 0,
            maintenanceExcluded: 0,
            notEligible: 1,
            needsAttention: 0,
            hasAnyBillActivity: true,
          },
        },
      ],
    };

    const missing = fleetRoomsMissingElectricityFromSummary(fleet);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.roomId, 'r2');
  });
});
