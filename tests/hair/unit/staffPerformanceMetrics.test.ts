import assert from 'node:assert/strict';
import test from 'node:test';
import {
  staffCombinedAttributedPaise,
  staffProductSalesPaise,
  staffServicePerformancePaise,
} from '../../../src/hair/domain/staffPerformance/metrics.ts';

test('Part 12 scenario — product sales vs service performance', () => {
  const staff1 = { servicePaise: 100_000, productPaise: 0, packagePaise: 0, membershipPaise: 0 };
  const staff2 = { servicePaise: 40_000, productPaise: 0, packagePaise: 0, membershipPaise: 0 };
  const staff3 = { servicePaise: 0, productPaise: 150_000, packagePaise: 0, membershipPaise: 0 };

  assert.equal(staffServicePerformancePaise(staff1), 100_000);
  assert.equal(staffServicePerformancePaise(staff2), 40_000);
  assert.equal(staffProductSalesPaise(staff3), 150_000);
  assert.equal(staffProductSalesPaise(staff1), 0);

  const collection = staffCombinedAttributedPaise(staff1) + staffCombinedAttributedPaise(staff3);
  assert.equal(collection, 250_000);
});
