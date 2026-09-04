import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildResidentPayableNowRows,
  computeResidentPayableNowTotalPaise,
  parseResidentPayableTarget,
  resolveResidentPayAllPresentation,
} from '@/src/lib/residents/residentPayableNowProjection';
import { isRoomChangePayAllSource } from '@/src/lib/residents/residentFinancialInvoiceDueRows';
import { mapFinancialInvoiceToDueRow } from '@/src/lib/residents/residentFinancialInvoiceDueRows';
import { ROOM_CHANGE_INVOICE_SOURCE, ROOM_SHIFT_FEE_PAISE } from '@/src/services/roomShiftQuote';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

function dueRow(overrides: Partial<PaymentDueRow> = {}): PaymentDueRow {
  return {
    key: 'rent-r1',
    label: 'Rent · September',
    amountPaise: 7_600_00,
    dueDate: '2026-09-07',
    href: '/account/resident/pay-rent/r1',
    status: 'Pending',
    ...overrides,
  };
}

describe('resident payable-now projection (Pay All SSOT)', () => {
  test('1 — rent due → Pay All visible', () => {
    const payables = buildResidentPayableNowRows({
      dueRows: [dueRow()],
      bookingId: 'bk-1',
    });
    const payAll = resolveResidentPayAllPresentation(payables);
    assert.equal(payAll.visible, true);
    assert.equal(payAll.totalPaise, 7_600_00);
    assert.equal(payAll.needsAggregateLink, false);
  });

  test('2 — electricity due → Pay All visible', () => {
    const payables = buildResidentPayableNowRows({
      dueRows: [
        dueRow({
          key: 'elec-e1',
          label: 'Electricity · Sep',
          amountPaise: 8_300,
          href: '/account/resident/pay-electricity/e1',
          electricityInvoiceId: 'e1',
        }),
      ],
      bookingId: 'bk-1',
    });
    assert.equal(resolveResidentPayAllPresentation(payables).visible, true);
  });

  test('3 — room-change fee due → Pay All visible', () => {
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
    const payables = buildResidentPayableNowRows({
      dueRows: [fee!],
      bookingId: 'bk-1',
    });
    assert.equal(resolveResidentPayAllPresentation(payables).visible, true);
  });

  test('4 — deposit difference due → Pay All visible', () => {
    const payables = buildResidentPayableNowRows({
      dueRows: [
        dueRow({
          key: 'deposit-due',
          label: 'Security deposit',
          amountPaise: 38_860,
          href: '/pay/dep-link',
        }),
      ],
      bookingId: 'bk-1',
    });
    assert.equal(parseResidentPayableTarget(payables[0]!, 'bk-1')?.kind, 'deposit');
    assert.equal(resolveResidentPayAllPresentation(payables).visible, true);
  });

  test('5 — multiple categories → correct sum + aggregate link', () => {
    const payables = buildResidentPayableNowRows({
      dueRows: [
        dueRow(),
        dueRow({
          key: 'elec-e1',
          label: 'Electricity',
          amountPaise: 8_300,
          href: '/account/resident/pay-electricity/e1',
          electricityInvoiceId: 'e1',
        }),
      ],
      bookingId: 'bk-1',
    });
    const payAll = resolveResidentPayAllPresentation(payables);
    assert.equal(payAll.visible, true);
    assert.equal(payAll.totalPaise, 7_600_00 + 8_300);
    assert.equal(payAll.needsAggregateLink, true);
  });

  test('6 — financial invoice due → Pay All visible', () => {
    const fi = mapFinancialInvoiceToDueRow({
      id: 'fi-1',
      invoiceNumber: 'INV-C',
      notes: 'Custom charge',
      sourceTable: 'custom_charge',
      amountPaise: 500_00,
      paidPaise: 0,
      status: 'sent',
      dueDate: '2026-09-07',
      roomNumber: '101',
      bedCode: 'B1',
      paymentLinkId: 'plink',
    });
    const payables = buildResidentPayableNowRows({ dueRows: [fi!], bookingId: 'bk-1' });
    assert.equal(resolveResidentPayAllPresentation(payables).visible, true);
  });

  test('7 — parent pay-all aggregate excluded from Bills Due rows', () => {
    assert.equal(isRoomChangePayAllSource(ROOM_CHANGE_INVOICE_SOURCE.payAll), true);
    const payAllRow = mapFinancialInvoiceToDueRow({
      id: 'all-1',
      invoiceNumber: 'INV-ALL',
      notes: 'Room change — pay all',
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
      amountPaise: ROOM_SHIFT_FEE_PAISE,
      paidPaise: 0,
      status: 'sent',
      dueDate: '2026-09-07',
      roomNumber: '204',
      bedCode: 'B1',
      paymentLinkId: 'c',
    });
    assert.equal(payAllRow, null);
  });

  test('8 — rejected payment remains payable in projection', () => {
    const rejected = dueRow({
      key: 'elec-e2',
      label: 'Electricity · rejected',
      amountPaise: 8_300,
      href: '/account/resident/pay-electricity/e2',
      status: 'Rejected',
      electricityInvoiceId: 'e2',
    });
    const payables = buildResidentPayableNowRows({
      dueRows: [],
      rejectedRows: [rejected],
      bookingId: 'bk-1',
    });
    assert.equal(payables.length, 1);
    assert.equal(computeResidentPayableNowTotalPaise(payables), 8_300);
    assert.equal(resolveResidentPayAllPresentation(payables).visible, true);
  });

  test('9 — paid row without href excluded', () => {
    const payables = buildResidentPayableNowRows({
      dueRows: [dueRow({ href: null })],
      bookingId: 'bk-1',
    });
    assert.equal(payables.length, 0);
    assert.equal(resolveResidentPayAllPresentation(payables).visible, false);
  });

  test('10 — zero total → Pay All hidden', () => {
    const payables = buildResidentPayableNowRows({ dueRows: [], bookingId: 'bk-1' });
    assert.equal(resolveResidentPayAllPresentation(payables).visible, false);
  });

  test('11 — Bills Due total equals Pay All total for mixed due + rejected', () => {
    const due = dueRow({ amountPaise: 4_000_00 });
    const rejected = dueRow({
      key: 'elec-e3',
      amountPaise: 500_00,
      href: '/account/resident/pay-electricity/e3',
      electricityInvoiceId: 'e3',
      status: 'Rejected',
    });
    const payables = buildResidentPayableNowRows({
      dueRows: [due],
      rejectedRows: [rejected],
      bookingId: 'bk-1',
    });
    const total = computeResidentPayableNowTotalPaise(payables);
    const payAll = resolveResidentPayAllPresentation(payables);
    assert.equal(payAll.totalPaise, total);
    assert.equal(total, 4_500_00);
  });

  test('12 — dedupe same target once', () => {
    const row = dueRow();
    const payables = buildResidentPayableNowRows({
      dueRows: [row, { ...row }],
      bookingId: 'bk-1',
    });
    assert.equal(payables.length, 1);
  });
});
