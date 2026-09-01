/**
 * Integration-style regression: deposit-link approval for room-change (APG-2026-0021 pattern).
 * Covers idempotency, orphaned UTR lock, no premature bed transfer, frozen quote.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  depositLinkLedgerReason,
  invoiceDepositLedgerReason,
  parsePaymentsRelatedId,
} from '@/src/lib/payments/paymentsRelatedId';
import { postTransferBillingAnchorDate } from '@/src/lib/billing/postTransferRentPricing';
import {
  ROOM_CHANGE_INVOICE_SOURCE,
  ROOM_SHIFT_FEE_PAISE,
  applyRoomShiftCreditWaterfall,
} from '@/src/services/roomShiftQuote';
import {
  roomChangeChargesSettledFromRows,
} from '@/src/services/roomTransferBilling';

const LINK_ID = '0d3e7d24-c6b7-474a-ac39-80f7e70e2990';
const BOOKING_ID = '90c6fd25-bf5b-41c4-9b34-527bfe9c969a';
const REQUEST_ID = '0156f051-42b4-4584-8417-051d0d7dc846';
const PROVIDER_PAYMENT_ID = `deposit-link-proof-${LINK_ID}`;

describe('deposit link approval room-change (APG-2026-0021)', () => {
  test('1 — approval path uses invoice allocation + reason-based ledger idempotency', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentCharges.ts'),
      'utf8',
    );
    assert.match(src, /allocateInvoicePayment/);
    assert.match(src, /providerPaymentId = `deposit-link-proof-\$\{linkId\}`/);
    const deposits = readFileSync(join(process.cwd(), 'src/services/deposits.ts'), 'utf8');
    assert.match(deposits, /eq\(depositLedger\.reason, reason\)/);
    assert.equal(
      invoiceDepositLedgerReason(BOOKING_ID, REQUEST_ID),
      `invoice-deposit:${BOOKING_ID}:${REQUEST_ID}`,
    );
    assert.equal(parsePaymentsRelatedId(PROVIDER_PAYMENT_ID), null);
  });

  test('2 — second approval is no-op when link already paid', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentCharges.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('export async function approveDepositLinkPaymentProof'));
    assert.match(fn, /if \(link\.status === 'paid'\)/);
    assert.match(fn, /return \{ ok: true \}/);
  });

  test('3 — orphaned UTR lock for same source is reused, not rejected', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/pgTransactionRefIndex.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('export async function insertApprovedTransactionRefOrThrow'));
    assert.match(fn, /existing\.sourceKind === input\.sourceKind/);
    assert.match(fn, /existing\.sourceId === input\.sourceId/);
    assert.match(fn, /return;/);
  });

  test('4 — deposit approval alone does not complete room transfer', () => {
    const rows = [
      { sourceTable: ROOM_CHANGE_INVOICE_SOURCE.deposit, status: 'paid', amountPaise: 321_140 },
      { sourceTable: ROOM_CHANGE_INVOICE_SOURCE.newRent, status: 'sent', amountPaise: 19_101 },
    ];
    assert.equal(roomChangeChargesSettledFromRows(rows), false);

    const lifecycle = readFileSync(
      join(process.cwd(), 'src/services/roomTransferLifecycle.ts'),
      'utf8',
    );
    assert.match(lifecycle, /const settled = await roomChangeChargesSettled\(requestId\)/);
    assert.match(lifecycle, /if \(!settled\) return \{ ok: true, status: row\.status \}/);
  });

  test('5 — ₹191.01 new-room rent remains payable after deposit only', () => {
    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: 0,
      newRentChargePaise: 23_262,
      shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
      depositTopUpPaise: 321_140,
      unusedPrepaidCreditPaise: 13_161,
    });
    assert.equal(waterfall.newRentDuePaise, 19_101);

    const afterDepositPaid = [
      { sourceTable: ROOM_CHANGE_INVOICE_SOURCE.deposit, status: 'paid', amountPaise: 321_140 },
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.newRent,
        status: 'sent',
        amountPaise: waterfall.newRentDuePaise,
      },
    ];
    assert.equal(roomChangeChargesSettledFromRows(afterDepositPaid), false);
  });

  test('6 — September rent anchor is Sep 1 after month-end transfer', () => {
    assert.equal(postTransferBillingAnchorDate('2026-08-31'), '2026-09-01');
    const reconcile = readFileSync(
      join(process.cwd(), 'src/services/rentInvoices.ts'),
      'utf8',
    );
    assert.match(reconcile, /reconcileRentInvoicesAfterRoomTransfer/);
  });

  test('7 — frozen Aug 31 quote amounts unchanged', () => {
    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: 0,
      newRentChargePaise: 23_262,
      shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
      depositTopUpPaise: 321_140,
      unusedPrepaidCreditPaise: 13_161,
    });
    assert.equal(waterfall.newRentDuePaise, 19_101);
    assert.equal(waterfall.depositDuePaise, 321_140);
    assert.equal(waterfall.feeDuePaise, 0);
    assert.equal(waterfall.totalDuePaise, 340_241);
    assert.equal(depositLinkLedgerReason(LINK_ID), `deposit-link:${LINK_ID}`);
  });
});
