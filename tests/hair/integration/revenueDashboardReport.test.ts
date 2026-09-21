import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasHairDatabaseUrl } from '../../../src/hair/lib/db/env';

describe('revenue dashboard report integration', () => {
  it('loads report for default salon month range', async (t) => {
    if (!hasHairDatabaseUrl()) {
      t.skip('DATABASE_URL / hair DB not configured');
      return;
    }
    const { getRevenueDashboardReportForPage } = await import(
      '../../../src/hair/services/revenueDashboardReport'
    );
    const report = await getRevenueDashboardReportForPage({}, null);
    assert.equal(typeof report.sales.totalPaise, 'number');
    assert.equal(typeof report.duesCurrentOutstandingPaise, 'number');
    assert.equal(report.netContribution.usesCurrentCatalogCost, true);
    assert.ok(report.netContribution.netCollectionContributionPaise <= report.netContribution.grossSalesPaise);
  });
});
