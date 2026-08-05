/**
 * Payment-approval latency instrumentation.
 * Logs step timings when PAYMENT_APPROVAL_TIMING=1 or in development.
 * Flags Health Brain when total exceeds 2000ms.
 */

import { logger } from '@/src/lib/logger';

export type PaymentApprovalTimer = {
  mark: (step: string) => void;
  finish: (meta?: Record<string, unknown>) => Record<string, number>;
};

const SLOW_APPROVAL_MS = 2000;

/**
 * Log approval flow timing and open a Health Brain P1 when over threshold.
 * Best-effort — never throws into the approve hot path.
 */
export function logApprovalFlowTiming(input: {
  label: string;
  steps: Record<string, number>;
  meta?: Record<string, unknown>;
}): void {
  const total = input.steps.total_ms ?? 0;
  const payload = {
    label: input.label,
    steps: input.steps,
    ...(input.meta ?? {}),
  };

  const enabled =
    process.env.PAYMENT_APPROVAL_TIMING === '1' || process.env.NODE_ENV !== 'production';
  if (enabled) {
    console.info('[payment-approval-timing]', JSON.stringify(payload));
  }

  if (total <= SLOW_APPROVAL_MS) return;

  logger.warn('payment.approval.slow', {
    ...payload,
    thresholdMs: SLOW_APPROVAL_MS,
  });

  void import('@/src/lib/health/healthBrain')
    .then(({ alertHealthBrainIncident }) =>
      alertHealthBrainIncident({
        severity: 'P1',
        brain: 'Operations',
        code: 'PAYMENT_APPROVAL_SLOW',
        entityType: 'payment_approval',
        entityId: String(input.meta?.invoiceId ?? input.meta?.entityId ?? input.label),
        cause: `${input.label} took ${total}ms (threshold ${SLOW_APPROVAL_MS}ms)`,
        source: 'payment_approval_timing',
      }),
    )
    .catch(() => undefined);
}

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

      logApprovalFlowTiming({ label, steps, meta });
      return steps;
    },
  };
}
