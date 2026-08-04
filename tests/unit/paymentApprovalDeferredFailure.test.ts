import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scheduleAfterPaymentApproval } from '@/src/lib/payments/scheduleAfterPaymentApproval';

describe('scheduleAfterPaymentApproval', () => {
  it('logs deferred failures without throwing to the caller', async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    try {
      scheduleAfterPaymentApproval(async () => {
        throw new Error('simulated deferred boom');
      });
      // Fallback path runs void run() — give microtask/macrotask a tick.
      await new Promise((r) => setTimeout(r, 50));
      assert.ok(
        errors.some((e) => e.includes('deferred work failed') && e.includes('simulated deferred boom')),
        `expected deferred failure log, got: ${JSON.stringify(errors)}`,
      );
    } finally {
      console.error = original;
    }
  });

  it('recordRentPaymentSuccess schedules deferred work after settlement commit', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/rentInvoices.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function recordRentPaymentSuccess'));
    const body = fn.slice(0, fn.indexOf('\nexport async function recordRentPaymentFailure'));
    const txClose = body.indexOf('});', body.indexOf('db.transaction(async (tx)'));
    const scheduleAt = body.indexOf('scheduleAfterPaymentApproval');
    assert.ok(txClose > 0 && scheduleAt > txClose, 'deferred schedule must be after settlement TX');
    assert.match(body, /PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE/);
  });

  it('approveRentProofAction keeps settlement success when deferred cache inject fails', () => {
    const actions = readFileSync(
      join(process.cwd(), 'app/(admin)/admin/payments/actions.ts'),
      'utf8',
    );
    const fn = actions.slice(actions.indexOf('export async function approveRentProofAction'));
    const body = fn.slice(0, fn.indexOf('\nexport async function approveElectricityProofAction'));
    assert.match(body, /PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE/);
    assert.match(body, /scheduleAfterPaymentApproval/);
    const scheduleIdx = body.indexOf('scheduleAfterPaymentApproval');
    const successFinishIdx = body.lastIndexOf('timer.finish');
    assert.ok(scheduleIdx > 0, 'scheduleAfterPaymentApproval present');
    assert.ok(successFinishIdx > scheduleIdx, 'success timer.finish after schedule');
    assert.match(body, /skippedNextKeyLookup:\s*true/);
  });
});
