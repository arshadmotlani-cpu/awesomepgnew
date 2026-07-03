import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildResident360Workflow } from '../../src/lib/residents/resident360Workflow';
import { isKycReviewRequired } from '../../src/lib/residents/residentUnresolvedActions';

const base = {
  customerId: 'cust-1',
  customerName: 'Dhairya Zinzuvadiya',
  kycStatus: 'pending' as const,
  pendingKycSubmissionId: null,
  hasActiveTenancy: true,
  hasBed: true,
  bookingId: 'booking-1',
  financialSummary: null,
  residencyStatus: 'active',
};

describe('resident360Workflow KYC SSOT', () => {
  it('does not show identity review when kyc_status pending but no submission', () => {
    const workflow = buildResident360Workflow(base);
    assert.ok(!workflow.stateLine.includes('identity review required'));
    assert.equal(
      isKycReviewRequired({ pendingKycSubmissionId: null }),
      false,
    );
  });

  it('shows identity review only when a pending submission exists', () => {
    const workflow = buildResident360Workflow({
      ...base,
      pendingKycSubmissionId: 'sub-1',
    });
    assert.ok(workflow.stateLine.includes('identity review required'));
    assert.equal(workflow.primaryAction?.href, '/admin/residents/kyc/sub-1');
  });

  it('payment-verified resident with bed skips KYC review without submission', () => {
    const workflow = buildResident360Workflow({
      ...base,
      kycStatus: 'pending',
      hasActiveTenancy: true,
      hasBed: true,
    });
    assert.ok(
      workflow.stateLine.includes('active resident') ||
        workflow.stateLine.includes('no dues') ||
        !workflow.stateLine.includes('identity review required'),
    );
  });

  it('prefers primaryUnresolved from SSOT over heuristics', () => {
    const workflow = buildResident360Workflow({
      ...base,
      pendingKycSubmissionId: 'sub-1',
      primaryUnresolved: {
        kind: 'payment_review',
        sourceKey: 'unresolved:payment_review:x',
        label: 'Review payment proof',
        href: '/admin/operations?filter=waiting_for_approval&focus=rent%3Aabc',
        stateLine: 'Payment proof pending',
        nextAction: 'Approve or reject the proof.',
        priority: 'high',
      },
    });
    assert.equal(workflow.primaryAction?.label, 'Review payment proof');
    assert.ok(!workflow.stateLine.includes('identity review required'));
  });
});
