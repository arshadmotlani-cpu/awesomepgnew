import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTodaysWorkCards,
  countNeedsAttention,
  greetingForHour,
} from '../../src/lib/admin/todaysWorkPresentation';
import type { ResidentsQueueRow } from '../../src/lib/residents/residentOperationsResidentsView';

function queueRow(overrides: Partial<ResidentsQueueRow>): ResidentsQueueRow {
  return {
    id: 'q-1',
    customerId: 'c-1',
    residentName: 'Ishaan Jaiswal',
    pgName: 'SHANTINAGAR',
    roomNumber: '102',
    bedCode: 'B2',
    currentState: 'Move-out',
    nextAction: 'Review settlement',
    owner: 'Move-out',
    ageLabel: 'Today',
    ageSortHours: 12,
    primaryActionLabel: 'Continue',
    primaryHref: '/admin/checkout-settlements/abc-1111-2222-3333-444455556666',
    filterTags: ['move_out'],
    bookingId: 'b-1',
    kycSubmissionId: null,
    vacatingRequestId: 'v-1',
    category: 'move_out',
    ...overrides,
  };
}

describe('todaysWorkPresentation', () => {
  it('puts waiting for resident last', () => {
    const cards = buildTodaysWorkCards(
      [
        queueRow({
          id: 'wait',
          residentName: 'Dhruv',
          primaryHref: '/admin/checkout-settlements/wait-id',
        }),
        queueRow({ id: 'bed', category: 'bed_assignment', primaryHref: '/admin/beds' }),
      ],
      [
        {
          id: 'wait-id',
          customerId: 'c-1',
          customerName: 'Dhruv',
          status: 'awaiting_resident_details',
          electricityMeterPhotoUrl: null,
          electricityUseAverage: false,
          payoutQrUrl: null,
          payoutUpiId: null,
          electricitySharePaise: 0,
          electricityCalculationMethod: 'meter_reading',
          meterPhotoMissing: false,
          depositRequiredPaise: 95000,
          updatedAt: new Date(),
        } as never,
      ],
    );
    assert.equal(cards[0].workflowLabel, 'Bed assignment');
    assert.equal(cards.at(-1)?.priority, 'waiting_resident');
  });

  it('counts attention excluding waiting resident', () => {
    const cards = buildTodaysWorkCards(
      [queueRow({}), queueRow({ id: '2', category: 'bed_assignment', primaryHref: '/admin/beds' })],
      [],
    );
    assert.ok(countNeedsAttention(cards) >= 1);
  });

  it('greets by time of day', () => {
    assert.equal(greetingForHour(9), 'Good morning');
    assert.equal(greetingForHour(14), 'Good afternoon');
    assert.equal(greetingForHour(20), 'Good evening');
  });
});
