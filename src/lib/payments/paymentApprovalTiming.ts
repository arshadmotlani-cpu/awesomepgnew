/**
 * Payment-approval latency instrumentation.
 * Logs step timings when PAYMENT_APPROVAL_TIMING=1 or in development.
 */

export type PaymentApprovalTimer = {
  mark: (step: string) => void;
  finish: (meta?: Record<string, unknown>) => Record<string, number>;
};

export function startPaymentApprovalTimer(label: string): PaymentApprovalTimer {
  const t0 = performance.now();
  const marks: Array<{ step: string; at: number }> = [{ step: 'start', at: t0 }];

  return {
    mark(step: string) {
      marks.push({ step, at: performance.now() });
    },
    finish(meta) {
      const end = performance.now();
      const steps: Record<string, number> = {};
      for (let i = 1; i < marks.length; i++) {
        const prev = marks[i - 1]!;
        const cur = marks[i]!;
        steps[cur.step] = Math.round((cur.at - prev.at) * 10) / 10;
      }
      steps.total_ms = Math.round((end - t0) * 10) / 10;

      const enabled =
        process.env.PAYMENT_APPROVAL_TIMING === '1' ||
        process.env.NODE_ENV !== 'production';
      if (enabled) {
        console.info(
          '[payment-approval-timing]',
          JSON.stringify({ label, steps, ...(meta ?? {}) }),
        );
      }
      return steps;
    },
  };
}
