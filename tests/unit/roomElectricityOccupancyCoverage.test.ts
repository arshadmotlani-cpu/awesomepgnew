import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billingMonthCalendarDays,
  mergeRoomElectricityCoverage,
  type RoomElectricityReservationSegment,
} from '@/src/lib/billing/roomElectricityOccupancyCoverage';

const month = '2026-08-01';
const base = {
  roomId: 'room-a',
  bookingId: 'booking-a',
  customerId: 'resident-a',
};

function segment(
  bedId: string,
  startDate: string,
  endDateExclusive: string | null,
  overrides: Partial<RoomElectricityReservationSegment> = {},
): RoomElectricityReservationSegment {
  return { ...base, bedId, startDate, endDateExclusive, ...overrides };
}

test('same-room bed change is one continuous electricity interval', () => {
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [segment('bed-1', month, '2026-08-16'), segment('bed-2', '2026-08-16', null)],
  });
  assert.equal(coverage.activeDays, 31);
  assert.deepEqual(coverage.intervals, [
    { startDate: '2026-08-01', endDateExclusive: '2026-09-01' },
  ]);
  assert.deepEqual(new Set(coverage.bedIds), new Set(['bed-1', 'bed-2']));
});

test('multiple same-room bed changes do not duplicate resident-days', () => {
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [
      segment('bed-1', month, '2026-08-10'),
      segment('bed-2', '2026-08-10', '2026-08-20'),
      segment('bed-3', '2026-08-20', null),
    ],
  });
  assert.equal(coverage.activeDays, 31);
  assert.equal(new Set(coverage.occupiedDates).size, 31);
});

test('cross-room transfer creates one exact room boundary', () => {
  const allSegments = [
    segment('bed-old', month, '2026-08-16'),
    segment('bed-new', '2026-08-16', null, { roomId: 'room-b' }),
  ];
  const [oldRoom] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: allSegments,
  });
  const [newRoom] = mergeRoomElectricityCoverage({
    roomId: 'room-b',
    billingMonth: month,
    segments: allSegments,
  });
  assert.deepEqual(oldRoom.occupiedDates.at(-1), '2026-08-15');
  assert.deepEqual(newRoom.occupiedDates[0], '2026-08-16');
  assert.equal(oldRoom.activeDays + newRoom.activeDays, 31);
});

test('cross-month room coverage clips to the requested month', () => {
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [segment('bed-1', '2026-07-20', '2026-09-10')],
  });
  assert.deepEqual(coverage.occupiedDates, billingMonthCalendarDays(month));
});

test('overlapping sibling-bed rows count the resident once per room-day', () => {
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [
      segment('bed-1', month, null),
      segment('bed-2', month, null),
      segment('bed-2', month, null),
    ],
  });
  assert.equal(coverage.activeDays, 31);
});

test('a future transfer hold has no electricity effect', () => {
  // Holds never enter coverage segments — only historical active/completed stays do.
  const facts = [segment('bed-1', month, null)];
  const beforeRequest = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: facts,
  });
  const afterHoldCreatedButNotCompleted = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: facts, // no hold segment added
  });
  assert.deepEqual(afterHoldCreatedButNotCompleted, beforeRequest);
  assert.equal(beforeRequest[0]?.activeDays, 31);
});

test('malformed stay bounds are skipped — never crash electricity coverage', () => {
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [
      segment('bed-1', 'infinity', null),
      segment('bed-1', 'not-a-date', '2026-08-20'),
      segment('bed-1', month, null),
    ],
  });
  assert.equal(coverage?.activeDays, 31);
});

test('empty gap days are not assigned to either resident', () => {
  const coverage = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [
      segment('bed-1', month, '2026-08-16', { customerId: 'leaving' }),
      segment('bed-2', '2026-08-20', null, {
        customerId: 'joining',
        bookingId: 'booking-b',
      }),
    ],
  });
  const leaving = coverage.find((c) => c.customerId === 'leaving');
  const joining = coverage.find((c) => c.customerId === 'joining');
  assert.ok(leaving && joining);
  assert.equal(leaving.occupiedDates.includes('2026-08-16'), false);
  assert.equal(leaving.occupiedDates.includes('2026-08-15'), true);
  assert.equal(joining.occupiedDates.includes('2026-08-19'), false);
  assert.equal(joining.occupiedDates.includes('2026-08-20'), true);
  const allDays = new Set([...leaving.occupiedDates, ...joining.occupiedDates]);
  assert.equal(allDays.has('2026-08-17'), false);
  assert.equal(allDays.has('2026-08-18'), false);
  assert.equal(allDays.has('2026-08-19'), false);
});

test('transfer cancellation / pending hold never injects target-room electricity occupancy', () => {
  const sourceRoom = mergeRoomElectricityCoverage({
    roomId: 'room-204',
    billingMonth: month,
    segments: [segment('bed-204-b1', month, null, { roomId: 'room-204' })],
  });
  const targetRoomWhileHeld = mergeRoomElectricityCoverage({
    roomId: 'room-101',
    billingMonth: month,
    // Hold is never a reservation segment for electricity.
    segments: [],
  });
  assert.equal(sourceRoom[0]?.activeDays, 31);
  assert.deepEqual(targetRoomWhileHeld, []);
});

test('transfer completion is reflected only via historical reservation segments', () => {
  const before = mergeRoomElectricityCoverage({
    roomId: 'room-204',
    billingMonth: month,
    segments: [segment('bed-204', month, null, { roomId: 'room-204' })],
  });
  const afterCompletion = mergeRoomElectricityCoverage({
    roomId: 'room-204',
    billingMonth: month,
    segments: [segment('bed-204', month, '2026-08-16', { roomId: 'room-204' })],
  });
  const targetAfterCompletion = mergeRoomElectricityCoverage({
    roomId: 'room-101',
    billingMonth: month,
    segments: [
      segment('bed-204', month, '2026-08-16', { roomId: 'room-204' }),
      segment('bed-101', '2026-08-16', null, {
        roomId: 'room-101',
        bookingId: 'booking-a',
      }),
    ],
  });
  assert.equal(before[0]?.activeDays, 31);
  assert.equal(afterCompletion[0]?.activeDays, 15);
  assert.equal(targetAfterCompletion[0]?.occupiedDates[0], '2026-08-16');
  assert.equal(afterCompletion[0]!.activeDays + targetAfterCompletion[0]!.activeDays, 31);
});

test('mid-month leave ends liability at half-open boundary', () => {
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [segment('bed-1', month, '2026-08-16')],
  });
  assert.equal(coverage.occupiedDates.at(-1), '2026-08-15');
  assert.equal(coverage.activeDays, 15);
});

test('mid-month enter begins liability on actual occupancy date', () => {
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [segment('bed-1', '2026-08-20', null)],
  });
  assert.equal(coverage.occupiedDates[0], '2026-08-20');
  assert.equal(coverage.activeDays, 12);
});

test('same-room B3→B1 does not alter historical electricity liability days', () => {
  const continuous = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [segment('bed-3', month, null)],
  })[0]!;
  const afterBedChange = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: month,
    segments: [
      segment('bed-3', month, '2026-08-12'),
      segment('bed-1', '2026-08-12', null),
    ],
  })[0]!;
  assert.equal(continuous.activeDays, afterBedChange.activeDays);
  assert.deepEqual(continuous.occupiedDates, afterBedChange.occupiedDates);
});
