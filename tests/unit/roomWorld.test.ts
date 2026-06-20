import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { usesElectricityCheckoutQr, resolveBookingCheckoutQr } from '../../src/lib/payments/checkoutQr';
import { getRoomVisualSeed } from '../../src/lib/roomWorld/roomVisualSeed';
import { isDirectVideoUrl, resolveRoomMedia } from '../../src/lib/roomWorld/roomMedia';
import {
  firstRoomIndexOnFloor,
  nextRoomIndex,
  orderRoomsForTheater,
  prevRoomIndex,
} from '../../src/lib/roomWorld/roomTheaterNav';
import {
  floorShortLabel,
  groupRoomsByFloor,
  occupancyRatio,
  roomAvailabilityLabel,
  spineTransformForOffset,
  spineVisualOffset,
} from '../../src/lib/roomWorld/dnaSpineLayout';
import {
  buildFloorBoundaries,
  fractionalActiveIndex,
  getFloorBoundaryAtIndex,
  getFloorFromIndex,
  getFloorRange,
} from '../../src/lib/roomWorld/floorEngine';

describe('checkout QR routing', () => {
  it('uses electricity QR for fixed stays', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'fixed_stay' }), true);
  });

  it('uses rent QR for open-ended living', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'open_ended' }), false);
  });

  it('uses rent QR for monthly stays', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'monthly' }), false);
  });

  it('uses electricity QR for reserve bookings', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'reserve' }), true);
  });

  it('resolveBookingCheckoutQr picks electricity path for fixed_stay', () => {
    const qr = resolveBookingCheckoutQr({
      durationMode: 'fixed_stay',
      rentCategory: { qrCodeImageUrl: '/rent.png', upiId: 'rent@upi' },
      electricityCategory: { qrCodeImageUrl: '/elec.png', upiId: 'elec@upi' },
    });
    assert.equal(qr.qrImageUrl, '/elec.png');
    assert.equal(qr.upiId, 'elec@upi');
  });
});

describe('room theater nav', () => {
  it('rolls from last room to first on next', () => {
    const rooms = [
      { roomId: 'a', floorNumber: 1 },
      { roomId: 'b', floorNumber: 1 },
      { roomId: 'c', floorNumber: 2 },
    ];
    const ordered = orderRoomsForTheater(rooms);
    assert.equal(nextRoomIndex(2, ordered.length), 0);
  });

  it('rolls from first to last on prev', () => {
    assert.equal(prevRoomIndex(0, 3), 2);
  });

  it('jumps to first room on target floor', () => {
    const rooms = [
      { roomId: 'a', floorNumber: 0 },
      { roomId: 'b', floorNumber: 1 },
      { roomId: 'c', floorNumber: 1 },
    ];
    assert.equal(firstRoomIndexOnFloor(rooms, 1), 1);
  });
});

describe('room media', () => {
  it('maps pg gallery index to room media', () => {
    const m = resolveRoomMedia({
      roomIndex: 1,
      pgImages: ['/a.jpg', '/b.jpg'],
      pgVideos: ['/v1.mp4'],
    });
    assert.equal(m.imageUrl, '/b.jpg');
    assert.equal(m.videoUrl, '/v1.mp4');
  });

  it('detects direct video urls', () => {
    assert.equal(isDirectVideoUrl('/pg/videos/tour.mp4'), true);
    assert.equal(isDirectVideoUrl('https://youtube.com/watch?v=x'), false);
  });
});

describe('room visual seed', () => {
  it('is deterministic per room id', () => {
    const a = getRoomVisualSeed('room-abc-123');
    const b = getRoomVisualSeed('room-abc-123');
    assert.deepEqual(a, b);
    assert.ok(a.seed >= 0 && a.seed < 7);
  });
});

describe('dna spine layout', () => {
  const rooms = [
    {
      roomId: 'a',
      roomNumber: '101',
      roomType: 'standard',
      floorNumber: 0,
      floorLabel: 'Ground Floor',
      capacity: 4,
      hasAc: true,
      availableBeds: 2,
      totalBeds: 4,
      beds: [],
    },
    {
      roomId: 'b',
      roomNumber: '201',
      roomType: 'standard',
      floorNumber: 1,
      floorLabel: 'Floor 1',
      capacity: 3,
      hasAc: false,
      availableBeds: 0,
      totalBeds: 3,
      beds: [],
    },
  ];

  it('groups rooms by floor with short labels', () => {
    const groups = groupRoomsByFloor(rooms);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]!.shortLabel, 'G');
    assert.equal(groups[1]!.shortLabel, '1F');
  });

  it('clamps spine visual offset', () => {
    assert.equal(spineVisualOffset(10, 0), 3);
    assert.equal(spineVisualOffset(-5, 0), -3);
    assert.equal(spineVisualOffset(2, 2), 0);
  });

  it('applies 3D depth for above/below active room', () => {
    const above = spineTransformForOffset(-1, false);
    const below = spineTransformForOffset(1, false);
    assert.ok(above.rotateX < 0);
    assert.ok(below.rotateX > 0);
    assert.ok(above.translateZ < 0);
    assert.ok(below.translateZ > 0);
  });

  it('labels availability from bed counts', () => {
    assert.equal(roomAvailabilityLabel(rooms[0]!), '2 free');
    assert.equal(roomAvailabilityLabel(rooms[1]!), 'Full');
  });

  it('computes occupancy ratio', () => {
    assert.equal(occupancyRatio(rooms[0]!), 0.5);
    assert.equal(occupancyRatio(rooms[1]!), 0);
  });

  it('formats ground floor short label', () => {
    assert.equal(floorShortLabel(0, 'Ground Floor'), 'G');
    assert.equal(floorShortLabel(2, 'Floor 2'), '2F');
  });
});

describe('dna floor engine v3', () => {
  it('maps index to generic floor bands', () => {
    assert.equal(getFloorFromIndex(7, 6), 1);
    assert.deepEqual(getFloorRange(1, 6), { start: 6, end: 11 });
  });

  it('builds real PG floor boundaries', () => {
    const bounds = buildFloorBoundaries([
      {
        floorNumber: 0,
        floorLabel: 'Ground',
        shortLabel: 'G',
        rooms: [{ roomId: 'a' }, { roomId: 'b' }] as never[],
      },
      {
        floorNumber: 1,
        floorLabel: 'Floor 1',
        shortLabel: '1F',
        rooms: [{ roomId: 'c' }] as never[],
      },
    ]);
    assert.equal(bounds[1]!.startIndex, 2);
    assert.equal(getFloorBoundaryAtIndex(2, bounds)?.shortLabel, '1F');
  });

  it('computes fractional active index for continuous scroll', () => {
    assert.equal(fractionalActiveIndex(100, 400, 128, 48), 1.96875);
  });
});
