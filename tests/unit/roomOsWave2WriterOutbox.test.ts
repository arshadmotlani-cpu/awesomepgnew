/**
 * Room OS Wave 2 — Ledger writers → outbox wiring tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  enqueuePropertyIndexRebuildFromWriter,
  resolvePgIdForBed,
  resolvePgIdForBooking,
  resolvePgIdForRoom,
} from '@/src/roomOs/outbox/writerRebuild';

const WRITER_HOOKS: Array<{ file: string; sourceRef: string }> = [
  { file: 'src/services/booking.ts', sourceRef: 'booking.createBooking' },
  { file: 'src/services/bookingLifecycle.ts', sourceRef: 'bookingLifecycle.recordPaymentSuccess' },
  { file: 'src/services/bookingLifecycle.ts', sourceRef: 'bookingLifecycle.cancelBooking' },
  { file: 'src/services/meterElectricity.ts', sourceRef: 'meterElectricity.recordMeterLog' },
  { file: 'src/services/electricityBilling.ts', sourceRef: 'electricityBilling.createElectricityBill' },
  {
    file: 'src/services/electricityBilling.ts',
    sourceRef: 'electricityBilling.voidRoomElectricityBillsForMonth',
  },
  {
    file: 'src/services/electricityBilling.ts',
    sourceRef: 'electricityBilling.cancelElectricityInvoicesForBooking',
  },
  { file: 'src/services/rentInvoices.ts', sourceRef: 'rentInvoices.generateRentInvoicesForMonth' },
  { file: 'src/services/rentInvoices.ts', sourceRef: 'rentInvoices.ensureMonthlyRentInvoice' },
  { file: 'src/services/rentInvoices.ts', sourceRef: 'rentInvoices.recordRentPaymentSuccess' },
  { file: 'src/services/rentInvoices.ts', sourceRef: 'rentInvoices.cancelFutureRentInvoices' },
  { file: 'src/services/rentInvoices.ts', sourceRef: 'rentInvoices.createAdhocRentInvoice' },
  {
    file: 'src/services/rentInvoices.ts',
    sourceRef: 'rentInvoices.recalculatePendingRentInvoicesForBooking',
  },
  { file: 'src/services/deposits.ts', sourceRef: 'deposits.recordDepositCollected' },
  { file: 'src/services/deposits.ts', sourceRef: 'deposits.executeReconcileDepositLedger' },
  { file: 'src/services/depositSettlement.ts', sourceRef: 'depositSettlement.applyDepositDeduction' },
  {
    file: 'src/services/depositSettlement.ts',
    sourceRef: 'depositSettlement.settleDepositWithDeductions',
  },
  {
    file: 'src/services/depositSettlement.ts',
    sourceRef: 'depositSettlement.settleVacatingDepositRefund',
  },
  { file: 'src/services/vacating.ts', sourceRef: 'vacating.shortenBookingReservationsToDate' },
  { file: 'src/services/vacating.ts', sourceRef: 'vacating.completeBookingReservations' },
];

describe('Room OS Wave 2 — Ledger Writers → Outbox', () => {
  test('writerRebuild enqueues property_index.rebuild_requested command only', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/outbox/writerRebuild.ts'),
      'utf8',
    );
    assert.match(src, /property_index\.rebuild_requested/);
    assert.doesNotMatch(src, /property_index\.materialized/);
    assert.match(src, /appendRoomOsOutboxEntry/);
  });

  test('writer helper exports pgId resolvers for transactional writers', () => {
    assert.equal(typeof resolvePgIdForBed, 'function');
    assert.equal(typeof resolvePgIdForRoom, 'function');
    assert.equal(typeof resolvePgIdForBooking, 'function');
    assert.equal(typeof enqueuePropertyIndexRebuildFromWriter, 'function');
  });

  test('canonical writers enqueue inside transactions', () => {
    for (const hook of WRITER_HOOKS) {
      const src = readFileSync(join(process.cwd(), hook.file), 'utf8');
      assert.match(
        src,
        new RegExp(`sourceRef: '${hook.sourceRef.replace('.', '\\.')}'`),
        `${hook.file} missing ${hook.sourceRef}`,
      );
      assert.match(
        src,
        /enqueuePropertyIndexRebuildFromWriter\(tx,/,
        `${hook.file} must pass tx to outbox enqueue`,
      );
    }
  });

  test('writers import outbox helper, not projectors', () => {
    const writerFiles = [...new Set(WRITER_HOOKS.map((h) => h.file))];
    for (const file of writerFiles) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      assert.match(src, /@\/src\/roomOs\/outbox\/writerRebuild/);
      assert.doesNotMatch(src, /from ['"]@\/src\/roomOs\/projectors\//);
    }
  });

  test('appendRoomOsOutboxEntry accepts transactional db handle', () => {
    const src = readFileSync(join(process.cwd(), 'src/roomOs/outbox/append.ts'), 'utf8');
    assert.match(src, /tx: RoomOsDb = db/);
  });
});
