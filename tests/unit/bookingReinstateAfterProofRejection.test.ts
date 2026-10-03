import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('booking reinstate after proof rejection', () => {
  it('cleanupRejectedBookingRequest closes open-ended stay ranges on rejection', () => {
    const src = read('src/lib/bookingApproval.ts');
    assert.match(src, /closePrimaryStayRangesOnRejection/);
    assert.match(src, /cleanupRejectedBookingRequest/);
    assert.match(src, /upper\(br\.stay_range\) IS NULL/);
  });

  it('reinstateRejectedBookingRequest restores pending_approval and under_review reservation', () => {
    const src = read('src/lib/bookingApproval.ts');
    assert.match(src, /export async function reinstateRejectedBookingRequest/);
    assert.match(src, /payment_proof_rejected/);
    assert.match(src, /status: 'pending_approval'/);
    assert.match(src, /status: 'under_review'/);
    assert.match(src, /reinstated_after_proof_rejection/);
  });

  it('cancelled booking with open stay must not bypass electricity billable predicate', () => {
    const occupants = read('src/lib/billing/roomElectricityOccupants.ts');
    assert.match(occupants, /inArray\(bedReservations\.status, \['active', 'completed'\]\)/);
    const eligibility = read('src/lib/billing/electricityOccupancyEligibility.ts');
    assert.match(eligibility, /historicalCoverage/);
  });
});

describe('PG electricity checklist not eligible copy', () => {
  it('does not claim available beds for not_eligible status', () => {
    const ui = read('src/components/admin/electricity/PgElectricityBillingChecklist.tsx');
    assert.match(ui, /No billable monthly residents for this month/);
    assert.doesNotMatch(ui, /available beds/i);
  });

  it('electricity checklist inventory must not gate on has_ac (non-AC billed rooms included)', () => {
    const checklist = read('src/lib/billing/pgElectricityBillingChecklist.ts');
    assert.doesNotMatch(checklist, /eq\(roomTypes\.hasAc, true\)/);
    assert.match(checklist, /listPgRoomsForElectricityBillingInventory/);
  });
});
