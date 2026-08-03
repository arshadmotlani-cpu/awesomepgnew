/**
 * WORKFLOW_PAYMENT_PROOF_PARITY — workflow orchestrates Payment SSOT without extra mutation.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsWorkflowInstances } from '@/src/db/schema/roomOsWorkflowInstances';
import {
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationCheckContext, CertificationFinding } from '@/src/roomOs/certification/types';
import { canTransitionPaymentProofWorkflow } from '@/src/roomOs/workflow/stateMachine';
import type { PaymentProofWorkflowState } from '@/src/roomOs/workflow/types';

const VALID_TRANSITIONS: Array<[PaymentProofWorkflowState, PaymentProofWorkflowState]> = [
  ['submitted', 'under_review'],
  ['under_review', 'approved'],
  ['under_review', 'rejected'],
  ['rejected', 'resubmitted'],
  ['rejected', 'under_review'],
  ['resubmitted', 'under_review'],
];

const VALID_STATES = new Set<PaymentProofWorkflowState>([
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'resubmitted',
]);

export async function runWorkflowPaymentProofParityChecks(
  ctx: CertificationCheckContext,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  for (const [from, to] of VALID_TRANSITIONS) {
    if (canTransitionPaymentProofWorkflow(from, to)) {
      findings.push(
        passFinding(
          'WORKFLOW_PAYMENT_PROOF_PARITY',
          'workflow',
          `State machine allows ${from} → ${to}.`,
          { from, to },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'WORKFLOW_PAYMENT_PROOF_PARITY',
          'workflow',
          `State machine missing transition ${from} → ${to}.`,
          'allowed',
          'blocked',
          { from, to },
        ),
      );
    }
  }

  findings.push(
    warnFinding(
      'WORKFLOW_PAYMENT_PROOF_PARITY',
      'workflow',
      'Workflow module delegates approve/reject to Payment SSOT services — no direct ledger writes.',
    ),
  );

  const instances = await db
    .select({
      reviewKey: roomOsWorkflowInstances.reviewKey,
      currentState: roomOsWorkflowInstances.currentState,
    })
    .from(roomOsWorkflowInstances)
    .where(eq(roomOsWorkflowInstances.pgId, ctx.pgId))
    .limit(10);

  if (instances.length === 0) {
    findings.push(
      warnFinding(
        'WORKFLOW_PAYMENT_PROOF_PARITY',
        'workflow',
        'No workflow instances for property — live instance sample skipped (pre-UI wiring).',
      ),
    );
    return findings;
  }

  for (const instance of instances) {
    const state = instance.currentState as PaymentProofWorkflowState;
    if (VALID_STATES.has(state)) {
      findings.push(
        passFinding(
          'WORKFLOW_PAYMENT_PROOF_PARITY',
          'workflow',
          `Workflow instance ${instance.reviewKey} has valid state ${state}.`,
          { reviewKey: instance.reviewKey, currentState: state },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'WORKFLOW_PAYMENT_PROOF_PARITY',
          'workflow',
          `Workflow instance ${instance.reviewKey} has invalid state ${state}.`,
          'valid workflow state',
          state,
          { reviewKey: instance.reviewKey },
        ),
      );
    }
  }

  return findings;
}
