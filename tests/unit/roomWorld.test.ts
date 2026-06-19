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
