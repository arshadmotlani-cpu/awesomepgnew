import { and, desc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerTimeline,
  fyhCustomers,
  fyhFinancialLedger,
  fyhInvoiceLines,
  fyhInvoicePayments,
  fyhInvoices,
} from '@/src/hair/db/schema';
import { postCustomerAdvanceReceiveLedger } from '@/src/hair/domain/ledger/service';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import type { AdvancePaymentMethod } from '@/src/hair/services/loyaltyOps';
import { nextInvoiceNumberForTx } from '@/src/hair/services/invoices';
import { sumCustomerAdvanceCreditPaise } from '@/src/hair/services/customerTimeline';
import { walletBalanceFromLedger } from '@/src/hair/domain/ledger/plan';

export const ADVANCE_INVOICE_LINE_NAME = 'Advance Payment · Customer Credit';

export type CustomerCreditHistoryRow = {
  id: string;
  date: Date;
  description: string;
  creditPaise: number;
  usedPaise: number;
  balanceAfterPaise: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
};

export type CustomerCreditSummary = {
  availablePaise: number;
  totalAdvancePaise: number;
  consumedPaise: number;
};

export async function getCustomerCreditSummary(
  customerId: string,
  ctx?: TenantContext | null,
): Promise<CustomerCreditSummary> {
  ctx = await resolveTenantContextForService(ctx);
  const [totalAdvancePaise, ledgerRows] = await Promise.all([
    sumCustomerAdvanceCreditPaise(customerId, ctx),
    hairDb
      .select({
        kind: fyhFinancialLedger.kind,
        direction: fyhFinancialLedger.direction,
        amountPaise: fyhFinancialLedger.amountPaise,
      })
      .from(fyhFinancialLedger)
      .where(
        and(
          orgFilter(fyhFinancialLedger.organizationId, ctx),
          eq(fyhFinancialLedger.customerId, customerId),
        ),
      ),
  ]);
  const availablePaise = walletBalanceFromLedger(ledgerRows);
  const consumedPaise = Math.max(0, totalAdvancePaise - availablePaise);
  return { availablePaise, totalAdvancePaise, consumedPaise };
}

export async function listCustomerCreditHistory(
  customerId: string,
  ctx?: TenantContext | null,
): Promise<CustomerCreditHistoryRow[]> {
  ctx = await resolveTenantContextForService(ctx);
  const rows = await hairDb
    .select({
      id: fyhFinancialLedger.id,
      createdAt: fyhFinancialLedger.createdAt,
      kind: fyhFinancialLedger.kind,
      direction: fyhFinancialLedger.direction,
      amountPaise: fyhFinancialLedger.amountPaise,
      reference: fyhFinancialLedger.reference,
      invoiceId: fyhFinancialLedger.invoiceId,
      invoiceNumber: fyhInvoices.invoiceNumber,
    })
    .from(fyhFinancialLedger)
    .leftJoin(fyhInvoices, eq(fyhInvoices.id, fyhFinancialLedger.invoiceId))
    .where(
      and(
        orgFilter(fyhFinancialLedger.organizationId, ctx),
        eq(fyhFinancialLedger.customerId, customerId),
      ),
    )
    .orderBy(desc(fyhFinancialLedger.createdAt), desc(fyhFinancialLedger.id));

  let running = 0;
  const history: CustomerCreditHistoryRow[] = [];
  for (const row of [...rows].reverse()) {
    const creditPaise =
      row.kind === 'advance_credit' && row.direction === 'credit' ? row.amountPaise : 0;
    const usedPaise =
      row.kind === 'wallet_redemption' && row.direction === 'debit' ? row.amountPaise : 0;
    if (creditPaise > 0) running += creditPaise;
    if (usedPaise > 0) running -= usedPaise;
    if (creditPaise === 0 && usedPaise === 0) continue;
    history.push({
      id: row.id,
      date: row.createdAt,
      description:
        creditPaise > 0
          ? row.reference?.startsWith('advance_recv:')
            ? 'Advance received'
            : 'Credit added'
          : row.invoiceNumber
            ? `Used on ${row.invoiceNumber}`
            : 'Credit used',
      creditPaise,
      usedPaise,
      balanceAfterPaise: Math.max(0, running),
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
    });
  }
  return history.reverse();
}

export async function receiveCustomerAdvancePayment(
  input: {
    customerId: string;
    amountPaise: number;
    method: AdvancePaymentMethod;
    reference?: string | null;
    notes?: string | null;
    paidOn?: string | null;
    idempotencyKey?: string | null;
  },
  ctx?: TenantContext | null,
): Promise<{
  invoiceId: string;
  invoiceNumber: string;
  walletBalancePaise: number;
  reused: boolean;
}> {
  if (input.amountPaise <= 0) throw new Error('Amount must be positive');
  ctx = await resolveTenantContextForService(ctx);
  const writeDefaults = tenantWriteDefaults(ctx);
  const idempotencyReference = input.idempotencyKey
    ? `advance_recv:${input.idempotencyKey}`
    : `advance_recv:${input.customerId}:${input.amountPaise}:${input.method}:${input.paidOn ?? 'now'}`;

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;

    const existingLedger = await db
      .select({ invoiceId: fyhFinancialLedger.invoiceId })
      .from(fyhFinancialLedger)
      .where(
        and(
          orgFilter(fyhFinancialLedger.organizationId, ctx),
          eq(fyhFinancialLedger.customerId, input.customerId),
          eq(fyhFinancialLedger.reference, idempotencyReference),
          eq(fyhFinancialLedger.kind, 'advance_credit'),
        ),
      )
      .limit(1);
    if (existingLedger[0]?.invoiceId) {
      const [inv] = await db
        .select({
          id: fyhInvoices.id,
          invoiceNumber: fyhInvoices.invoiceNumber,
        })
        .from(fyhInvoices)
        .where(
          and(
            orgFilter(fyhInvoices.organizationId, ctx),
            eq(fyhInvoices.id, existingLedger[0].invoiceId),
          ),
        )
        .limit(1);
      const [customer] = await db
        .select({ walletBalancePaise: fyhCustomers.walletBalancePaise })
        .from(fyhCustomers)
        .where(
          and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, input.customerId)),
        )
        .limit(1);
      if (!inv) throw new Error('Advance receipt not found');
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        walletBalancePaise: customer?.walletBalancePaise ?? 0,
        reused: true,
      };
    }

    const [customer] = await db
      .select()
      .from(fyhCustomers)
      .where(
        and(
          orgFilter(fyhCustomers.organizationId, ctx),
          eq(fyhCustomers.id, input.customerId),
          eq(fyhCustomers.isActive, true),
        ),
      )
      .limit(1);
    if (!customer) throw new Error('Customer not found');

    const invoiceNumber = await nextInvoiceNumberForTx(db, ctx);
    const paidAt = input.paidOn ? new Date(`${input.paidOn}T12:00:00Z`) : new Date();

    const [inv] = await db
      .insert(fyhInvoices)
      .values({
        ...writeDefaults,
        invoiceNumber,
        customerId: customer.id,
        appointmentId: null,
        source: 'advance_payment',
        stylistId: null,
        status: 'paid',
        subtotalPaise: input.amountPaise,
        discountPaise: 0,
        taxPaise: 0,
        membershipRedemptionPaise: 0,
        packageRedemptionPaise: 0,
        walletRedemptionPaise: 0,
        giftCardRedemptionPaise: 0,
        tipPaise: 0,
        roundOffPaise: 0,
        grandTotalPaise: input.amountPaise,
        amountPaidPaise: input.amountPaise,
        paidAt,
        notes: input.notes?.trim() || null,
        posDraft: null,
      })
      .returning();
    if (!inv) throw new Error('Failed to create advance receipt');

    await db.insert(fyhInvoiceLines).values({
      ...writeDefaults,
      invoiceId: inv.id,
      kind: 'custom',
      serviceId: null,
      productId: null,
      packageId: null,
      membershipId: null,
      staffId: null,
      nameSnapshot: ADVANCE_INVOICE_LINE_NAME,
      quantity: 1,
      unitPricePaise: input.amountPaise,
      discountPaise: 0,
      taxPaise: 0,
      lineTotalPaise: input.amountPaise,
      sortOrder: 0,
    });

    await db.insert(fyhInvoicePayments).values({
      ...writeDefaults,
      invoiceId: inv.id,
      method: input.method,
      amountPaise: input.amountPaise,
      reference: input.reference?.trim() || null,
    });

    await postCustomerAdvanceReceiveLedger(
      db,
      {
        customerId: customer.id,
        invoiceId: inv.id,
        amountPaise: input.amountPaise,
        method: input.method,
        idempotencyReference,
      },
      ctx,
    );

    await db.insert(fyhCustomerTimeline).values({
      ...writeDefaults,
      customerId: customer.id,
      eventType: 'wallet',
      title: 'Customer credit · advance received',
      body: `${formatInrFromPaise(input.amountPaise)} via ${input.method}${input.notes ? ` · ${input.notes}` : ''} · ${inv.invoiceNumber}`,
      metadata: {
        source: 'advance_payment',
        invoiceId: inv.id,
        method: input.method,
        amountPaise: input.amountPaise,
        reference: input.reference ?? null,
      },
    });

    const [updated] = await db
      .select({ walletBalancePaise: fyhCustomers.walletBalancePaise })
      .from(fyhCustomers)
      .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customer.id)))
      .limit(1);

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      walletBalancePaise: updated?.walletBalancePaise ?? customer.walletBalancePaise,
      reused: false,
    };
  });
}
