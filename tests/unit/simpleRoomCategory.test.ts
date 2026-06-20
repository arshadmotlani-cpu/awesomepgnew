import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSimpleCategoryOptions,
  roomCategoryFromCapacity,
} from '../../src/lib/booking/simpleRoomCategory';

describe('simple room categories', () => {
  it('maps capacity to single, shared, dormitory', () => {
    assert.equal(roomCategoryFromCapacity(1), 'single');
    assert.equal(roomCategoryFromCapacity(3), 'shared');
    assert.equal(roomCategoryFromCapacity(8), 'dormitory');
  });

  it('builds three simple options with availability', () => {
    const options = buildSimpleCategoryOptions(
      [
        {
          roomId: 'r1',
          roomNumber: '101',
          roomType: 'Single',
          capacity: 1,
          hasAc: true,
          hasAttachedBath: true,
          floorNumber: 0,
          floorLabel: 'G',
          totalBeds: 1,
          availableBeds: 1,
          dailyRatePaise: 30000,
          weeklyRatePaise: 0,
          monthlyRatePaise: 0,
        },
      ],
      [
        {
          roomId: 'r1',
          roomNumber: '101',
          roomType: 'Single',
          capacity: 1,
          hasAc: true,
          floorLabel: 'G',
          floorNumber: 0,
          beds: [
            {
              bedId: 'b1',
              bedCode: 'A',
              status: 'available',
              isAvailableNow: true,
              nextAvailableDate: null,
              interestCount: 0,
              noticeInterestCount: 0,
              vacatingDate: null,
              vacatingStatus: null,
              reservedFrom: null,
              activeBedReserveCheckIn: null,
              manualOccupied: false,
              dailyRatePaise: 30000,
              weeklyRatePaise: 0,
              monthlyRatePaise: 0,
              securityDepositPaise: 500000,
              dailySecurityDepositPaise: 0,
              weeklySecurityDepositPaise: 0,
              monthlySecurityDepositPaise: 0,
            },
          ],
        },
      ],
    );
    assert.equal(options.length, 3);
    assert.equal(options[0]!.available, true);
    assert.equal(options[1]!.available, false);
  });
});
