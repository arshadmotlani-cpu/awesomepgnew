import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { exportRoomElectricityAuditExcel } from '@/src/lib/export/roomElectricityAuditExcel';
import type { RoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';

function sampleAudit(): RoomElectricityAuditView {
  return {
    roomSummary: {
      roomNumber: '203',
      pgName: 'Shanti Nagar',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-07-01',
      meterStartUnits: 1250,
      meterEndUnits: 1380,
      unitsConsumed: 130,
      ratePerUnitPaise: 1600,
      grossTotalPaise: 208_000,
      residentCount: 1,
      generatedAt: '2026-06-30T12:00:00.000Z',
      collectionStatus: 'partial',
      collectedPaise: 42_000,
      outstandingPaise: 84_000,
      collectionPercentage: 20,
    },
    roomNumber: '203',
    billingMonth: '2026-06-01',
    grossTotalPaise: 208_000,
    prepaidCreditPaise: 0,
    checkoutCreditsPaise: 42_000,
    manualCreditsPaise: 0,
    splittablePaise: 166_000,
    roundingRemainderPaise: 82_000,
    residentRows: [
      {
        invoiceId: 'inv1',
        invoiceNumber: 'ELE-2026-06-0001',
        bookingId: 'b1',
        customerId: 'c1',
        customerName: 'Resident A',
        bedCode: '203-A',
        checkIn: '2026-06-01',
        checkOut: null,
        daysCharged: 30,
        billingCycleDays: 30,
        occupancyPct: 100,
        unitsAllocated: 65,
        amountAllocatedPaise: 84_000,
        previousOutstandingPaise: 0,
        previousCollectedPaise: 0,
        currentPaidPaise: 0,
        currentOutstandingPaise: 84_000,
        amountPaidPaise: 0,
        status: 'pending',
        paymentStatus: 'pending',
        role: 'active',
        excludedBecauseCheckoutPaid: false,
        timeline: [],
      },
    ],
    sumAllocatedPaise: 84_000,
    sumCreditsPaise: 42_000,
    reconciliationGapPaise: 0,
    isBalanced: true,
    collectedPaise: 42_000,
    outstandingPaise: 84_000,
    collectionPercentage: 20,
  };
}

describe('exportRoomElectricityAuditExcel', () => {
  it('produces workbook with summary and resident sheets', async () => {
    const buf = await exportRoomElectricityAuditExcel({
      audit: sampleAudit(),
      paymentHistory: [],
      pgName: 'Shanti Nagar',
    });

    assert.ok(buf.length > 0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const summary = wb.getWorksheet('Room Summary');
    const residents = wb.getWorksheet('Residents');
    assert.ok(summary);
    assert.ok(residents);
    assert.equal(summary!.getCell('A2').value, 'PG');
    assert.equal(summary!.getCell('B2').value, 'Shanti Nagar');
    assert.equal(residents!.rowCount, 2);
    assert.equal(residents!.getRow(2).getCell(1).value, 'Resident A');
  });
});
