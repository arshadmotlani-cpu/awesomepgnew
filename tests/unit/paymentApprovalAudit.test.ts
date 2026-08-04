import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { sanitizeAuditDiff } from '@/src/lib/audit/writeAuditLog';
import {
  extractPostgresError,
  formatPostgresError,
} from '@/src/lib/db/postgresError';

describe('sanitizeAuditDiff', () => {
  it('strips undefined and serializes bigint values', () => {
    const diff = sanitizeAuditDiff({
      amountPaise: 408_000n,
      nested: { lateFee: undefined, ok: 1 },
      list: [2n, undefined, 3],
    }) as Record<string, unknown>;

    assert.equal(diff.amountPaise, 408_000);
    assert.deepEqual(diff.nested, { ok: 1 });
    assert.deepEqual(diff.list, [2, null, 3]);
  });

  it('converts invalid numbers to null', () => {
    const diff = sanitizeAuditDiff({ bad: Number.NaN }) as Record<string, unknown>;
    assert.equal(diff.bad, null);
  });
});

describe('formatPostgresError', () => {
  it('unwraps Drizzle Failed query errors to the underlying PostgreSQL detail', () => {
    const err = new Error('Failed query: insert into "audit_log" (...) values (...)');
  (err as { cause?: unknown }).cause = {
      code: '23502',
      message: 'null value in column "entity_id" of relation "audit_log" violates not-null constraint',
      detail: 'Failing row contains (...).',
      constraint_name: 'audit_log_entity_id_not_null',
      column_name: 'entity_id',
      table_name: 'audit_log',
    };

    const formatted = formatPostgresError(err);
    assert.match(formatted, /23502/);
    assert.match(formatted, /entity_id/);
    assert.match(formatted, /audit_log/);

    const pg = extractPostgresError(err);
    assert.equal(pg.code, '23502');
    assert.equal(pg.column, 'entity_id');
    assert.equal(pg.table, 'audit_log');
  });
});

describe('payment approval audit isolation', () => {
  it('recordRentPaymentSuccess commits payment before audit_log insert', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/rentInvoices.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('export async function recordRentPaymentSuccess'));
    const nextFn = fn.indexOf('\nexport async function recordRentPaymentFailure');
    const body = fn.slice(0, nextFn);

    const txClose = body.indexOf('});', body.indexOf('db.transaction(async (tx)'));
    const auditCall = body.indexOf('writeAuditLogNonBlocking(db');
    assert.ok(txClose > 0 && auditCall > txClose, 'audit must run after payment transaction');
    assert.doesNotMatch(body, /tx\.insert\(auditLog\)/);
    assert.match(body, /scheduleAfterPaymentApproval/);
  });

  it('recordElectricityPaymentSuccess commits payment before audit_log insert', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/electricityBilling.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('export async function recordElectricityPaymentSuccess'));
    const nextFn = fn.indexOf('\nexport async function recordElectricityPaymentFailure');
    const body = fn.slice(0, nextFn);

    const txClose = body.indexOf('});', body.indexOf('db.transaction(async (tx)'));
    const auditCall = body.indexOf('writeAuditLogNonBlocking(db');
    assert.ok(txClose > 0 && auditCall > txClose, 'audit must run after payment transaction');
    assert.doesNotMatch(body, /tx\.insert\(auditLog\)/);
  });
});

describe('rent payment approval hot path', () => {
  it('defers allocation persist, heavy revalidate, and skips next-key queue rebuild', () => {
    const actions = readFileSync(
      join(process.cwd(), 'app/(admin)/admin/payments/actions.ts'),
      'utf8',
    );
    const fn = actions.slice(actions.indexOf('export async function approveRentProofAction'));
    const nextFn = fn.indexOf('\nexport async function approveElectricityProofAction');
    const body = fn.slice(0, nextFn);

    assert.match(body, /scheduleAfterPaymentApproval\(/);
    assert.match(body, /persistApprovalAllocationAfterSuccess/);
    assert.match(body, /skippedNextKeyLookup:\s*true/);
    assert.match(body, /nextKey:\s*null/);
    assert.doesNotMatch(body, /withNextReviewKey/);
    assert.doesNotMatch(body, /getNextPendingPaymentReviewKey/);
  });
  it('defers post-commit rent side effects after settlement transaction', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/rentInvoices.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function recordRentPaymentSuccess'));
    const nextFn = fn.indexOf('\nexport async function recordRentPaymentFailure');
    const body = fn.slice(0, nextFn);
    assert.match(body, /scheduleAfterPaymentApproval/);
    assert.match(body, /Promise\.all\(/);
    assert.match(body, /createReceipt/);
    assert.match(body, /notifyPaymentReceipt/);
    assert.match(body, /creditReferralEarningOnBookingPayment/);
  });

  it('payment review workspace does not await badge refresh before redirect', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/admin/payment-review/PaymentReviewWorkspace.tsx'),
      'utf8',
    );
    assert.match(src, /void refreshAdminNavBadges\(\)/);
    assert.doesNotMatch(src, /await refreshAdminNavBadges\(\)/);
  });
});
