import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

/** Inventory / occupancy paths must not query checkout_settlements for physical state. */
const INVENTORY_PATHS = [
  'src/services/bedOccupancyBatch.ts',
  'src/services/pgBedMap.ts',
  'src/db/queries/customer.ts',
  'src/services/availabilityService.ts',
  'src/lib/bedOccupancyResolve.ts',
  'src/lib/bedOccupancyEngine.ts',
];

const FORBIDDEN_INVENTORY_PATTERNS = [
  /FROM checkout_settlements/i,
  /checkoutSettlementId:/,
  /pending_cs ON true/i,
];

describe('occupancy checkout_settlement isolation', () => {
  for (const rel of INVENTORY_PATHS) {
    test(`${rel} has no checkout_settlements SQL in inventory path`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      if (rel === 'src/lib/bedOccupancyEngine.ts') {
        assert.match(
          src,
          /isPhysicallyOccupiedToday/,
          'engine must expose reservation-only physical occupancy',
        );
        assert.match(
          src,
          /Never drives bed map/,
          'financial checkout must be documented as non-inventory',
        );
        return;
      }
      if (rel === 'src/lib/bedOccupancyResolve.ts') {
        assert.match(src, /occupancyFactsForInventory/, 'inventory strip helper required');
        assert.doesNotMatch(src, /checkoutSettlement\?:/, 'RawBedOccupancyFacts must not carry settlement');
        return;
      }
      if (rel === 'src/services/pgBedMap.ts') {
        assert.doesNotMatch(src, /pending_cs ON true/, 'bed map must not join open settlements for occupancy');
        assert.doesNotMatch(
          src,
          /pending_settlement_/,
          'bed map must not expose pending settlement occupancy columns',
        );
        assert.match(src, /resolveBedOccupancy\(/, 'bed map must use reservation SSOT resolver');
        assert.doesNotMatch(
          src,
          /checkoutSettlement:/,
          'bed map must not pass settlement into occupancy resolver',
        );
        return;
      }
      for (const pattern of FORBIDDEN_INVENTORY_PATTERNS) {
        assert.doesNotMatch(
          src,
          pattern,
          `${rel} must not reference checkout settlements for physical occupancy`,
        );
      }
    });
  }
});
