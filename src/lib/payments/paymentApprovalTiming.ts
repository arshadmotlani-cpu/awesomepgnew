/**
 * Payment-approval latency instrumentation.
 * Logs step timings when PAYMENT_APPROVAL_TIMING=1 or in development.
 */

export type PaymentApprovalTimer = {
  mark: (step: string) => void;
  finish: (meta?: Record<string, unknown>) => Record<string, number>;
};

const FRIENDLY_STEP: Record<string, string> = {
  auth: 'Auth',
  load_invoice: 'Load invoice',
  ensure_proof_snapshot: 'Load invoice',
  settle_critical: 'Settlement',
  apply_approved_payment_atomic: 'Settlement',
  settlement_transaction: 'Commit',
  schedule_deferred: 'Response returned',
  schedule_deferred_side_effects: 'Response returned',
  revalidate_fast: 'Response returned',
};

function printFriendlyTiming(label: string, steps: Record<string, number>) {
  const lines: string[] = [`--- ${label} ---`];
  const order = [
    'auth',
    'load_invoice',
    'ensure_proof_snapshot',
    'settle_critical',
    'apply_approved_payment_atomic',
    'settlement_transaction',
    'schedule_deferred',
    'schedule_deferred_side_effects',
    'revalidate_fast',
  ];
  const seen = new Set<string>();
  for (const key of order) {
    if (steps[key] == null) continue;
    const friendly = FRIENDLY_STEP[key] ?? key;
    if (seen.has(friendly)) continue;
    seen.add(friendly);
    lines.push(`${friendly.padEnd(22, '.')} ${steps[key]} ms`);
  }
  if (steps.total_ms != null) {
    lines.push(`${'Total'.padEnd(22, '.')} ${steps.total_ms} ms`);
  }
  console.info(lines.join('\n'));
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

      const enabled =
        process.env.PAYMENT_APPROVAL_TIMING === '1' ||
        process.env.NODE_ENV !== 'production';
      if (enabled) {
        console.info(
          '[payment-approval-timing]',
          JSON.stringify({ label, steps, ...(meta ?? {}) }),
        );
        printFriendlyTiming(label, steps);
      }
      return steps;
    },
  };
}
