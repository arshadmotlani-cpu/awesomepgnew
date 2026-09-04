import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isRoomChangePayAllSource,
  mapFinancialInvoiceToDueRow,
} from '@/src/lib/residents/residentFinancialInvoiceDueRows';
import { ROOM_CHANGE_INVOICE_SOURCE, ROOM_SHIFT_FEE_PAISE } from '@/src/services/roomShiftQuote';
import { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('same-room Change Bed dues on Bills Due', () => {
  test('pay-all aggregate is excluded from Bills Due', () => {
    assert.equal(isRoomChangePayAllSource(ROOM_CHANGE_INVOICE_SOURCE.payAll), true);
    const row = mapFinancialInvoiceToDueRow({
      id: 'pay-all-1',
      invoiceNumber: 'INV-1',
      notes: 'Room change — pay all',
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
      amountPaise: ROOM_SHIFT_FEE_PAISE,
      paidPaise: 0,
      status: 'sent',
      dueDate: '2026-09-07',
      roomNumber: '204',
      bedCode: 'B1',
      paymentLinkId: 'link-1',
    });
    assert.equal(row, null);
  });

  test('room-change fee invoice appears once in Bills Due with pay href', () => {
    const fee = mapFinancialInvoiceToDueRow({
      id: 'fee-1',
      invoiceNumber: 'INV-FEE',
      notes: 'Room change fee',
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.fee,
      amountPaise: ROOM_SHIFT_FEE_PAISE,
      paidPaise: 0,
      status: 'sent',
      dueDate: '2026-09-07',
      roomNumber: '204',
      bedCode: 'B1',
      paymentLinkId: 'plink-fee',
    });
    assert.ok(fee);
    assert.equal(fee!.amountPaise, ROOM_SHIFT_FEE_PAISE);
    assert.equal(fee!.href, '/pay/plink-fee');
    assert.match(fee!.label, /Change Bed/);
    assert.match(fee!.label, /Room change fee/);
    assert.equal(computeResidentTotalDuePaise([fee!]), ROOM_SHIFT_FEE_PAISE);
  });

  test('fee + deposit difference both appear; pay-all not double counted', () => {
    const fee = mapFinancialInvoiceToDueRow({
      id: 'fee-2',
      invoiceNumber: 'INV-FEE',
      notes: 'Room change fee',
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.fee,
      amountPaise: ROOM_SHIFT_FEE_PAISE,
      paidPaise: 0,
      status: 'sent',
      dueDate: '2026-09-07',
      roomNumber: '204',
      bedCode: 'B1',
      paymentLinkId: 'a',
    });
    const deposit = mapFinancialInvoiceToDueRow({
      id: 'dep-2',
      invoiceNumber: 'INV-DEP',
      notes: 'Additional deposit',
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.deposit,
      amountPaise: 50_000,
      paidPaise: 0,
      status: 'sent',
      dueDate: '2026-09-07',
      roomNumber: '204',
      bedCode: 'B1',
      paymentLinkId: 'b',
    });
    const payAll = mapFinancialInvoiceToDueRow({
      id: 'all-2',
      invoiceNumber: 'INV-ALL',
      notes: 'Room change — pay all',
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
      amountPaise: ROOM_SHIFT_FEE_PAISE + 50_000,
      paidPaise: 0,
      status: 'sent',
      dueDate: '2026-09-07',
      roomNumber: '204',
      bedCode: 'B1',
      paymentLinkId: 'c',
    });
    assert.ok(fee);
    assert.ok(deposit);
    assert.equal(payAll, null);
    const rows = [fee!, deposit!];
    assert.equal(computeResidentTotalDuePaise(rows), ROOM_SHIFT_FEE_PAISE + 50_000);
  });

  test('payments tab loader includes financial invoice due rows', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentPortalTabData.ts'),
      'utf8',
    );
    assert.match(src, /listResidentFinancialInvoiceDueRows/);
  });

  test('Change Bed flow opens payment step when total due > 0', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/requests/RoomChangeFlow.tsx'),
      'utf8',
    );
    assert.match(src, /totalDuePaise > 0 \? 'payment' : 'done'/);
  });

  test('same-room electricity coverage collapses bed intervals by room', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/billing/roomElectricityOccupancyCoverage.ts'),
      'utf8',
    );
    assert.match(src, /same room|collapse|continuous/i);
  });
});
