import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chartRows } from '../../../src/hair/lib/chartRows';
import {
  resolveDashboardChildPath,
  resolveDefaultLandingPath,
} from '../../../src/hair/lib/auth/guards';
import { buildRevenueDashboard } from '../../../src/hair/services/revenueDashboard';

describe('resolveDefaultLandingPath', () => {
  it('sends super_admin to revenue dashboard', () => {
    assert.equal(
      resolveDefaultLandingPath({ role: 'super_admin', permissions: [] }),
      '/dashboard/revenue',
    );
  });

  it('sends operational admin to appointments', () => {
    assert.equal(
      resolveDefaultLandingPath({ role: 'admin', permissions: [] }),
      '/appointments',
    );
  });

  it('respects custom permissions without dashboard', () => {
    assert.equal(
      resolveDefaultLandingPath({
        role: 'admin',
        permissions: ['page:customers'],
      }),
      '/customers',
    );
  });
});

describe('resolveDashboardChildPath', () => {
  it('returns revenue dashboard when permitted', () => {
    assert.equal(
      resolveDashboardChildPath({ role: 'super_admin', permissions: [] }),
      '/dashboard/revenue',
    );
  });
});

describe('chartRows', () => {
  it('returns empty array for undefined', () => {
    assert.deepEqual(chartRows(undefined), []);
    assert.deepEqual(chartRows(null), []);
  });
});

describe('buildRevenueDashboard', () => {
  it('passes through snapshot unchanged', () => {
    const snapshot = buildRevenueDashboard({
      timezone: 'Asia/Kolkata',
      todayRevenuePaise: 10000,
      mtdRevenuePaise: 50000,
      outstandingDuePaise: 0,
      advanceLiabilityPaise: 0,
      cashCollectedPaise: 0,
      upiCollectedPaise: 0,
      cardCollectedPaise: 0,
      walletBalancePaise: 0,
      averageBillTodayPaise: 10000,
      averageBillMtdPaise: 9000,
      invoicesToday: 1,
      appointmentsToday: 2,
      trend30Days: [],
      trend12Months: [],
      revenueByService: [],
      revenueByCategory: [],
      revenueByStaff: [],
      paymentMethodBreakdown: [],
      outstandingTrend30: [],
      averageBillTrend30: [],
      hourlyRevenueToday: [],
      revenueHeatmap: [],
      topServices: [],
      topProducts: [],
      customersToday: 1,
      repeatCustomersToday: 0,
      newCustomersToday: 1,
      appointmentConversionPct: 50,
      cancellationRatePct: 0,
      noShowRatePct: 0,
      averageCustomerSpendPaise: 10000,
      servicesRevenuePaise: 8000,
      productsRevenuePaise: 2000,
      membershipRevenuePaise: 0,
      packagesRevenuePaise: 0,
      giftCardsRevenuePaise: 0,
      refundsPaise: 0,
      discountsPaise: 0,
      netRevenuePaise: 10000,
      grossRevenuePaise: 10000,
      segmentCards: [],
    });
    assert.equal(snapshot.todayRevenuePaise, 10000);
  });
});
