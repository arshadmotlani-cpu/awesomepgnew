/**
 * Health Brain — incident emission (PARTIAL until unified Guardian Brain).
 * Structured errors land in audit_log + process logs for Operations / deploy health.
 */

import { db } from '@/src/db/client';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { logger } from '@/src/lib/logger';
import type { PaymentReviewInvariantViolation } from '@/src/lib/payments/paymentReviewInvariants';

export type HealthIncidentSeverity = 'P0' | 'P1' | 'P2';

export type PaymentReviewHealthIncidentInput = {
  severity?: HealthIncidentSeverity;
  kind: string;
  invoiceId: string | null;
  customerId?: string | null;
  billingMonth?: string | null;
  paymentProofUrl?: string | null;
  source: 'proof_submit' | 'operations_queue' | 'approve';
  violations: PaymentReviewInvariantViolation[];
};

const alertedKeys = new Set<string>();

/**
 * Opens a Health Brain incident for impossible payment-review attempts.
 * Best-effort: never throws into the request path.
 * Dedupes identical invoice+source+codes within the process lifetime to avoid queue spam.
 */
export async function alertHealthBrainPaymentReviewInvariant(
  input: PaymentReviewHealthIncidentInput,
): Promise<void> {
  const severity = input.severity ?? 'P0';
  const codes = input.violations.map((v) => v.code);
  const dedupeKey = `${input.source}:${input.kind}:${input.invoiceId ?? 'none'}:${codes.join(',')}`;
  if (alertedKeys.has(dedupeKey)) return;
  alertedKeys.add(dedupeKey);

  const payload = {
    brain: 'Health Brain',
    event: 'health.incident.opened',
    incidentType: 'payment_review_invariant_violation',
    severity,
    kind: input.kind,
    invoiceId: input.invoiceId,
    customerId: input.customerId ?? null,
    billingMonth: input.billingMonth ?? null,
    paymentProofUrlPrefix: input.paymentProofUrl?.trim().slice(0, 120) ?? null,
    source: input.source,
    codes,
    violations: input.violations,
  };

  logger.error('health.incident.opened', payload);

  if (!input.invoiceId) return;

  await writeAuditLogNonBlocking(db, {
    actorType: 'system',
    actorId: null,
    action: 'health.incident.opened',
    entity: 'payment_review',
    entityId: input.invoiceId,
    diff: payload,
  }).catch(() => undefined);
}

/** Test helper — reset in-process dedupe. */
export function resetHealthBrainIncidentDedupeForTests(): void {
  alertedKeys.clear();
}
