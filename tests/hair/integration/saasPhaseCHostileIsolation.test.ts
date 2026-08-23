import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhInvoices, fyhInvoiceLines, fyhInvoicePayments } from '@/src/hair/db/schema/billing';
import { fyhCustomers } from '@/src/hair/db/schema/customers';
import { fyhServices } from '@/src/hair/db/schema/services';
import { fyhFinancialLedger } from '@/src/hair/db/schema/financialLedger';
import { fyhSettings } from '@/src/hair/db/schema/settings';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { loadBillableCatalog } from '@/src/hair/domain/catalog/adapter';
import { postLedgerEntries } from '@/src/hair/domain/ledger/service';
import {
  getInvoiceDetailByNumber,
  getInvoiceDetailByPublicToken,
  listInvoices,
} from '@/src/hair/services/invoices';
import { getCustomer, listCustomers } from '@/src/hair/services/customers';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

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

test('Phase C hostile two-org isolation (catalog, ledger, public token)', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const prev = process.env.FYH_SAAS_TENANT;
  process.env.FYH_SAAS_TENANT = '1';

  const now = Date.now();
  const orgA = `00000000-0000-4000-8000-${String(now).slice(-12)}`;
  const orgB = `00000000-0000-4000-8001-${String(now + 1).slice(-12)}`;
  const locA = `10000000-0000-4000-8000-${String(now + 2).slice(-12)}`;
  const locB = `10000000-0000-4000-8001-${String(now + 3).slice(-12)}`;
  const ctxA = makeTenantContext(orgA, locA);
  const ctxB = makeTenantContext(orgB, locB);

  const attackLog: string[] = [];
  const expectDeny = (name: string, denied: boolean, detail: string) => {
    attackLog.push(`[${denied ? 'DENY' : 'LEAK'}] ${name} — ${detail}`);
    assert.ok(denied, `${name}: ${detail}`);
  };

  try {
    await hairDb.insert(fyhSettings).values([
      { organizationId: orgA, businessName: 'Hostile A Salon', timezone: 'Asia/Kolkata' },
      { organizationId: orgB, businessName: 'Hostile B Salon', timezone: 'Asia/Kolkata' },
    ]);

    const [customerA] = await hairDb
      .insert(fyhCustomers)
      .values({
        organizationId: orgA,
        customerCode: `HCA-${String(now).slice(-6)}`,
        fullName: `Hostile A ${now}`,
        phone: `9${String(now).slice(-9)}`.slice(0, 10),
        isActive: true,
      })
      .returning();
    const [customerB] = await hairDb
      .insert(fyhCustomers)
      .values({
        organizationId: orgB,
        customerCode: `HCB-${String(now + 1).slice(-6)}`,
        fullName: `Hostile B ${now}`,
        phone: `8${String(now).slice(-9)}`.slice(0, 10),
        isActive: true,
      })
      .returning();

    const [serviceA] = await hairDb
      .insert(fyhServices)
      .values({
        organizationId: orgA,
        name: `Hostile Cut A ${now}`,
        code: `HA${String(now).slice(-4)}`,
        category: 'Hair',
        pricePaise: 50_000,
        gstBps: 1800,
        isActive: true,
      })
      .returning();
    const [serviceB] = await hairDb
      .insert(fyhServices)
      .values({
        organizationId: orgB,
        name: `Hostile Cut B ${now}`,
        code: `HB${String(now).slice(-4)}`,
        category: 'Hair',
        pricePaise: 70_000,
        gstBps: 1800,
        isActive: true,
      })
      .returning();

    const invoiceNumberA = `HNA-${String(now).slice(-5)}`;
    const invoiceNumberB = `HNB-${String(now).slice(-5)}`;

    const [invoiceA] = await hairDb
      .insert(fyhInvoices)
      .values({
        organizationId: orgA,
        locationId: locA,
        invoiceNumber: invoiceNumberA,
        customerId: customerA!.id,
        source: 'quick_sale',
        status: 'paid',
        subtotalPaise: 50_000,
        taxPaise: 9_000,
        grandTotalPaise: 59_000,
        amountPaidPaise: 59_000,
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
        subtotalPaise: 70_000,
        taxPaise: 12_600,
        grandTotalPaise: 82_600,
        amountPaidPaise: 82_600,
        paidAt: new Date(),
      })
      .returning();

    await hairDb.insert(fyhInvoiceLines).values([
      {
        organizationId: orgA,
        locationId: locA,
        invoiceId: invoiceA!.id,
        kind: 'service',
        nameSnapshot: serviceA!.name,
        quantity: 1,
        unitPricePaise: 50_000,
        gstBps: 1800,
        taxPaise: 9_000,
        lineTotalPaise: 59_000,
        sortOrder: 0,
      },
      {
        organizationId: orgB,
        locationId: locB,
        invoiceId: invoiceB!.id,
        kind: 'service',
        nameSnapshot: serviceB!.name,
        quantity: 1,
        unitPricePaise: 70_000,
        gstBps: 1800,
        taxPaise: 12_600,
        lineTotalPaise: 82_600,
        sortOrder: 0,
      },
    ]);
    await hairDb.insert(fyhInvoicePayments).values([
      {
        organizationId: orgA,
        locationId: locA,
        invoiceId: invoiceA!.id,
        method: 'cash',
        amountPaise: 59_000,
      },
      {
        organizationId: orgB,
        locationId: locB,
        invoiceId: invoiceB!.id,
        method: 'upi',
        amountPaise: 82_600,
      },
    ]);

    await postLedgerEntries(
      hairDb,
      {
        customerId: customerA!.id,
        invoiceId: invoiceA!.id,
        entries: [
          {
            account: 'accounts_receivable',
            direction: 'debit',
            amountPaise: 59_000,
            method: null,
            kind: 'receivable_open',
            reference: 'hostile-a',
          },
        ],
      },
      ctxA,
    );
    await postLedgerEntries(
      hairDb,
      {
        customerId: customerB!.id,
        invoiceId: invoiceB!.id,
        entries: [
          {
            account: 'accounts_receivable',
            direction: 'debit',
            amountPaise: 82_600,
            method: null,
            kind: 'receivable_open',
            reference: 'hostile-b',
          },
        ],
      },
      ctxB,
    );

    const customersA = await listCustomers(undefined, ctxA);
    expectDeny(
      'A1 OrgA listCustomers excludes OrgB',
      !customersA.some((c) => c.id === customerB!.id) && customersA.some((c) => c.id === customerA!.id),
      `hasB=${customersA.some((c) => c.id === customerB!.id)}`,
    );

    const foreignCustomer = await getCustomer(customerB!.id, ctxA);
    expectDeny('A2 OrgA getCustomer(OrgB) null', foreignCustomer == null, `got=${foreignCustomer?.id}`);

    const invoicesA = await listInvoices(50, ctxA);
    expectDeny(
      'A3 OrgA listInvoices excludes OrgB',
      !invoicesA.some((i) => i.id === invoiceB!.id) && invoicesA.some((i) => i.id === invoiceA!.id),
      `hasB=${invoicesA.some((i) => i.id === invoiceB!.id)}`,
    );

    const crossInvoice = await getInvoiceDetailByNumber(invoiceNumberB, ctxA);
    expectDeny(
      'A4 OrgA read OrgB invoice number → null',
      crossInvoice == null,
      `got=${crossInvoice?.invoice.id}`,
    );

    const catalogA = await loadBillableCatalog(ctxA);
    expectDeny(
      'A5 OrgA catalog excludes OrgB service',
      !catalogA.some((i) => i.id === serviceB!.id) && catalogA.some((i) => i.id === serviceA!.id),
      `hasB=${catalogA.some((i) => i.id === serviceB!.id)}`,
    );

    let catalogNullThrew = false;
    try {
      await loadBillableCatalog(null);
    } catch {
      catalogNullThrew = true;
    }
    expectDeny('A6 null ctx + SaaS on throws for catalog', catalogNullThrew, catalogNullThrew ? 'threw' : 'no throw');

    const ledgerCross = await hairDb
      .select({ id: fyhFinancialLedger.id })
      .from(fyhFinancialLedger)
      .where(
        and(eq(fyhFinancialLedger.customerId, customerB!.id), eq(fyhFinancialLedger.organizationId, orgA)),
      );
    expectDeny(
      'A7 OrgA org-id cannot see OrgB ledger rows',
      ledgerCross.length === 0,
      `rows=${ledgerCross.length}`,
    );

    const numberAsToken = await getInvoiceDetailByPublicToken(invoiceNumberA);
    expectDeny(
      'A8 public lookup by invoice NUMBER fails closed',
      numberAsToken == null,
      `got=${numberAsToken?.invoice.id}`,
    );

    const publicA = await getInvoiceDetailByPublicToken(invoiceA!.publicAccessToken);
    expectDeny(
      'A9 OrgA public token resolves only OrgA',
      publicA?.invoice.id === invoiceA!.id && publicA.invoice.organizationId === orgA,
      `id=${publicA?.invoice.id}`,
    );

    const last = invoiceA!.publicAccessToken.slice(-1);
    const guess = invoiceA!.publicAccessToken.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    const guessed = await getInvoiceDetailByPublicToken(guess);
    expectDeny(
      'A10 adjacent token guess does not resolve OrgB',
      guessed == null || guessed.invoice.id !== invoiceB!.id,
      `got=${guessed?.invoice.id ?? 'null'}`,
    );

    const stolenWrite = await hairDb
      .update(fyhInvoices)
      .set({ notes: 'hostile-cross-write' })
      .where(and(eq(fyhInvoices.id, invoiceA!.id), eq(fyhInvoices.organizationId, orgB)))
      .returning({ id: fyhInvoices.id });
    expectDeny(
      'A11 OrgB cannot update OrgA invoice by id',
      stolenWrite.length === 0,
      `updated=${stolenWrite.length}`,
    );

    console.log('Phase C attack list:\n' + attackLog.join('\n'));
  } finally {
    if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
    else process.env.FYH_SAAS_TENANT = prev;
  }
});