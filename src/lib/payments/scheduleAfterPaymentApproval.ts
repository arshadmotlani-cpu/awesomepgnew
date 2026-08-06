/**
 * Schedule non-critical work after the payment-approval response is sent.
 * Falls back to fire-and-forget outside a Next.js request context (scripts/tests).
 */
export function scheduleAfterPaymentApproval(task: () => Promise<void>): void {
  const run = () =>
    task().catch((err) => {
      console.error(
        '[payment-approval] deferred work failed',
        err instanceof Error ? err.message : String(err),
      );
    });

  void (async () => {
    try {
      const { after } = await import('next/server');
      after(run);
    } catch {
      void run();
    }
  })();
}
