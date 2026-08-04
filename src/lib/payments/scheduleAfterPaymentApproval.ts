import { after } from 'next/server';

/**
 * Schedule non-critical work after the payment-approval response is sent.
 * Falls back to fire-and-forget outside a Next.js request context (scripts/tests).
 *
 * Failures are always logged — never thrown to the caller (settlement already committed).
 * When PAYMENT_APPROVAL_TIMING=1, logs deferred wall-clock duration.
 */
export function scheduleAfterPaymentApproval(task: () => Promise<void>): void {
  const run = () => {
    const t0 = performance.now();
    return task()
      .then(() => {
        if (process.env.PAYMENT_APPROVAL_TIMING === '1') {
          const ms = Math.round((performance.now() - t0) * 10) / 10;
          console.info(
            '[payment-approval-timing]',
            JSON.stringify({ label: 'deferred_tasks', steps: { deferred_tasks_ms: ms, total_ms: ms } }),
          );
          console.info(`Deferred tasks ........ ${ms} ms`);
        }
      })
      .catch((err) => {
        const ms = Math.round((performance.now() - t0) * 10) / 10;
        console.error(
          '[payment-approval] deferred work failed',
          err instanceof Error ? err.message : String(err),
          { deferred_tasks_ms: ms },
        );
        if (process.env.PAYMENT_APPROVAL_TIMING === '1') {
          console.info(`Deferred tasks ........ ${ms} ms (FAILED)`);
        }
      });
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
