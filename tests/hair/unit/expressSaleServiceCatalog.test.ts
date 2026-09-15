import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { mapServiceToBillableItem } from '@/src/hair/domain/catalog/adapter';
import { billableItemToSnapshot } from '@/src/hair/domain/catalog/snapshot';
import type { BillableItem } from '@/src/hair/domain/catalog/types';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const sampleService = {
  id: 'svc-1',
  organizationId: 'org-1',
  name: 'Custom Balayage',
  code: 'SVC-0099',
  category: 'Hair',
  durationMinutes: 90,
  pricePaise: 450000,
  costPricePaise: 0,
  gstBps: 1800,
  description: null,
  displayOrder: 100,
  commissionType: 'none' as const,
  commissionFixedPaise: 0,
  commissionPercentBps: 0,
  overrideStaffCommission: false,
  availableOnline: false,
  featured: false,
  showOnWebsite: false,
  totalBookings: 0,
  revenueGeneratedPaise: 0,
  lastBookedAt: null,
  averageDurationMinutes: 90,
  isActive: true,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Express Sale service catalog SSOT', () => {
  it('loadBillableCatalog delegates services to listBookableServices', () => {
    const adapter = read('src/hair/domain/catalog/adapter.ts');
    assert.match(adapter, /listBookableServices\(ctx\)/);
    assert.doesNotMatch(adapter, /shouldHideServiceFromBillable/);
    assert.match(adapter, /resolveTenantContextForService\(ctx\)/);
  });

  it('loadQuickSaleCatalog uses listBookableServices (no parallel service query)', () => {
    const qs = read('src/hair/services/quickSale.ts');
    const fn = qs.slice(qs.indexOf('export async function loadQuickSaleCatalog'), qs.indexOf('export type QuickSaleTotalsPreview'));
    assert.match(fn, /listBookableServices\(ctx\)/);
    assert.doesNotMatch(fn, /shouldHideServiceFromBillable/);
    assert.doesNotMatch(fn, /from\(fyhServices\)/);
  });

  it('listBookableServices forwards tenant context to listServices', () => {
    const salon = read('src/hair/services/salonServices.ts');
    assert.match(salon, /listBookableServices[\s\S]*listServices\(\{ status: 'active' \}, ctx\)/);
  });

  it('custom Configuration service maps to billable item with canonical id and price', () => {
    const item = mapServiceToBillableItem(sampleService);
    assert.equal(item.id, 'svc-1');
    assert.equal(item.type, 'service');
    assert.equal(item.name, 'Custom Balayage');
    assert.equal(item.sellingPricePaise, 450000);
    assert.equal(item.durationMinutes, 90);
    assert.equal(item.active, true);
  });

  it('inactive service is excluded by listServices status filter (bookable list)', () => {
    const salon = read('src/hair/services/salonServices.ts');
    assert.match(salon, /listBookableServices[\s\S]*status: 'active'/);
  });

  it('invoice snapshot freezes name/price at basket time (historical lines unchanged)', () => {
    const item: BillableItem = mapServiceToBillableItem(sampleService);
    const snap = billableItemToSnapshot(item);
    assert.equal(snap.name, 'Custom Balayage');
    assert.equal(snap.unitSellingPricePaise, 450000);
    const edited = mapServiceToBillableItem({ ...sampleService, name: 'Renamed', pricePaise: 1 });
    assert.notEqual(edited.name, snap.name);
    assert.notEqual(edited.sellingPricePaise, snap.unitSellingPricePaise);
  });

  it('service mutations revalidate Quick Sale catalog page', () => {
    const actions = read('src/hair/actions/services.ts');
    assert.match(actions, /revalidatePath\('\/quick-sale'\)/);
  });

  it('Quick Sale search matches name and category client-side', () => {
    const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
    assert.match(shell, /matchesBillable/);
    assert.match(shell, /item\.category/);
  });

  it('package credits reference serviceId (same identity as catalog)', () => {
    const credits = read('src/hair/domain/packages/availableServices.ts');
    assert.match(credits, /serviceId: string/);
  });
});
