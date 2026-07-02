import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { refundRequestStatusLabel } from '../../src/lib/residents/commandCenterLinks';

describe('refundRequestStatusLabel', () => {
  it('maps resident refund pipeline statuses for Command Center', () => {
    assert.equal(refundRequestStatusLabel('submitted'), 'Requested');
    assert.equal(refundRequestStatusLabel('under_review'), 'Under Review');
    assert.equal(refundRequestStatusLabel('approved'), 'Approved');
    assert.equal(refundRequestStatusLabel('completed'), 'Paid');
    assert.equal(refundRequestStatusLabel('rejected'), 'Rejected');
  });
});
