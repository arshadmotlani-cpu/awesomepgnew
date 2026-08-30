import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhInvoices, fyhInvoiceLines, fyhInvoicePayments } from '@/src/hair/db/schema/billing';
import { fyhCustomers } from '@/src/hair/db/schema/customers';
import { fyhSettings } from '@/src/hair/db/schema/settings';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { getInvoiceDetailByNumber, listInvoices } from '@/src/hair/services/invoices';
import { listCustomers } from '@/src/hair/services/customers';
import { assertHairIntegrationTestWritesAllowed } from '@/src/hair/lib/db/integrationWriteGuard';

function makeTenantContext(organizationId: string, locationId: string): TenantContext {
  return {
    userId: `user-${organizationId}`,
    organizationId,
    locationId,
    membershipId: `membership-${organizationId}`,
    membershipRole: 'owner',
    allowedLocationIds: [locationId],
    permissions: [],
  };
}

test('tenant-aware customer and invoice reads stay inside active organization', async () => {
  assertHairIntegrationTestWritesAllowed();
  const prev = process.env.FYH_SAAS_TENANT;
  process.env.FYH_SAAS_TENANT = '1';

  const now = Date.now();
  const orgA = `00000000-0000-0000-0000-${String(now).slice(-12)}`;
  const orgB = `00000000-0000-0000-0001-${String(now + 1).slice(-12)}`;
  const locA = `10000000-0000-0000-0000-${String(now + 2).slice(-12)}`;
  const locB = `10000000-0000-0000-0001-${String(now + 3).slice(-12)}`;
  const ctxA = makeTenantContext(orgA, locA);
  const ctxB = makeTenantContext(orgB, locB);

  const [customerA] = await hairDb
    .insert(fyhCustomers)
    .values({
      organizationId: orgA,
      customerCode: `TIA-${String(now).slice(-6)}`,
      fullName: `Tenant A ${now}`,
      phone: `9${String(now).slice(-9)}`.slice(0, 10),
      isActive: true,
    })
    .returning();
  const [customerB] = await hairDb
    .insert(fyhCustomers)
    .values({
      organizationId: orgB,
      customerCode: `TIB-${String(now + 1).slice(-6)}`,
      fullName: `Tenant B ${now}`,
      phone: `8${String(now).slice(-9)}`.slice(0, 10),
      isActive: true,
    })
    .returning();

  await hairDb.insert(fyhSettings).values([
    { organizationId: orgA, businessName: 'Tenant A Salon', timezone: 'Asia/Kolkata' },
    { organizationId: orgB, businessName: 'Tenant B Salon', timezone: 'Asia/Kolkata' },
  ]);

  const invoiceNumberA = `TNA-${String(now).slice(-5)}`;
  const invoiceNumberB = `TNB-${String(now).slice(-5)}`;

  const [invoiceA] = await hairDb
    .insert(fyhInvoices)
    .values({
      organizationId: orgA,
      locationId: locA,
      invoiceNumber: invoiceNumberA,
      customerId: customerA!.id,
      source: 'quick_sale',
      status: 'paid',
      subtotalPaise: 10000,
      taxPaise: 1800,
      grandTotalPaise: 11800,
      amountPaidPaise: 11800,
      paidAt: new Date(),
    })
    .returning();
  const [invoiceB] = await hairDb
    .insert(fyhInvoices)
    .values({
      organizationId: orgB,
      locationId: locB,
      invoiceNumber: invoiceNumberB,
      customerId: customerB!.id,
      source: 'quick_sale',
      status: 'paid',
      subtotalPaise: 20000,
      taxPaise: 3600,
      grandTotalPaise: 23600,
      amountPaidPaise: 23600,
      paidAt: new Date(),
    })
    .returning();

  await hairDb.insert(fyhInvoiceLines).values([
    {
      organizationId: orgA,
      locationId: locA,
      invoiceId: invoiceA!.id,
      kind: 'product',
      nameSnapshot: 'Tenant A Product',
      quantity: 1,
      unitPricePaise: 10000,
      gstBps: 1800,
      taxPaise: 1800,
      lineTotalPaise: 11800,
      sortOrder: 0,
    },
    {
      organizationId: orgB,
      locationId: locB,
      invoiceId: invoiceB!.id,
      kind: 'product',
      nameSnapshot: 'Tenant B Product',
      quantity: 1,
      unitPricePaise: 20000,
      gstBps: 1800,
      taxPaise: 3600,
      lineTotalPaise: 23600,
      sortOrder: 0,
    },
  ]);

  await hairDb.insert(fyhInvoicePayments).values([
    { organizationId: orgA, locationId: locA, invoiceId: invoiceA!.id, method: 'cash', amountPaise: 11800 },
    { organizationId: orgB, locationId: locB, invoiceId: invoiceB!.id, method: 'upi', amountPaise: 23600 },
  ]);

  const customersA = await listCustomers(undefined, ctxA);
  const customersB = await listCustomers(undefined, ctxB);
  assert.ok(customersA.some((c) => c.id === customerA!.id));
  assert.ok(customersB.some((c) => c.id === customerB!.id));
  assert.ok(!customersA.some((c) => c.id === customerB!.id));
  assert.ok(!customersB.some((c) => c.id === customerA!.id));

  const invoicesA = await listInvoices(20, ctxA);
  const invoicesB = await listInvoices(20, ctxB);
  assert.ok(invoicesA.some((i) => i.id === invoiceA!.id));
  assert.ok(invoicesB.some((i) => i.id === invoiceB!.id));
  assert.ok(!invoicesA.some((i) => i.id === invoiceB!.id));
  assert.ok(!invoicesB.some((i) => i.id === invoiceA!.id));

  const detailA = await getInvoiceDetailByNumber(invoiceNumberA, ctxA);
  const detailB = await getInvoiceDetailByNumber(invoiceNumberB, ctxB);
  const crossA = await getInvoiceDetailByNumber(invoiceNumberB, ctxA);
  const crossB = await getInvoiceDetailByNumber(invoiceNumberA, ctxB);
  assert.equal(detailA?.invoice.id, invoiceA!.id);
  assert.equal(detailB?.invoice.id, invoiceB!.id);
  assert.equal(crossA, null);
  assert.equal(crossB, null);

  // Sanity check persisted tenant columns on the synthetic rows.
  const [persistedA] = await hairDb
    .select({ organizationId: fyhInvoices.organizationId, locationId: fyhInvoices.locationId })
    .from(fyhInvoices)
    .where(eq(fyhInvoices.id, invoiceA!.id))
    .limit(1);
  assert.equal(persistedA?.organizationId, orgA);
  assert.equal(persistedA?.locationId, locA);

  if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
  else process.env.FYH_SAAS_TENANT = prev;
});
