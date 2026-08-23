import { and, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhCustomers, fyhFinancialLedger } from '@/src/hair/db/schema';
import type { FinancialLedgerEntryDraft } from '@/src/hair/domain/ledger/types';
import { walletBalanceFromLedger } from '@/src/hair/domain/ledger/plan';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export async function postLedgerEntries(
  db: typeof hairDb,
  input: {
    customerId: string;
    invoiceId: string | null;
    entries: FinancialLedgerEntryDraft[];
    occurredAt?: Date;
  },
  ctx?: TenantContext | null,
) {
  if (!input.entries.length) return;
  const at = input.occurredAt ?? new Date();
  const orgDefaults = tenantOrgDefaults(ctx);
  await db.insert(fyhFinancialLedger).values(
    input.entries.map((e) => ({
      ...orgDefaults,
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      account: e.account,
      direction: e.direction,
      amountPaise: e.amountPaise,
      method: e.method,
      kind: e.kind,
      reference: e.reference ?? null,
      createdAt: at,
    })),
  );
}

export async function reconcileCustomerWalletCache(
  db: typeof hairDb,
  customerId: string,
  ctx?: TenantContext | null,
) {
  const rows = await db
    .select({
      kind: fyhFinancialLedger.kind,
      direction: fyhFinancialLedger.direction,
      amountPaise: fyhFinancialLedger.amountPaise,
    })
    .from(fyhFinancialLedger)
    .where(
      and(orgFilter(fyhFinancialLedger.organizationId, ctx), eq(fyhFinancialLedger.customerId, customerId)),
    );

  const balance = walletBalanceFromLedger(rows);
  await db
    .update(fyhCustomers)
    .set({ walletBalancePaise: balance, updatedAt: new Date() })
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customerId)));
  return balance;
}

export async function sumCustomerReceivablePaise(
  db: typeof hairDb,
  customerId: string,
  ctx?: TenantContext | null,
) {
  const [row] = await db
    .select({
      open: sql<number>`coalesce(sum(case when ${fyhFinancialLedger.kind} = 'receivable_open' and ${fyhFinancialLedger.direction} = 'debit' then ${fyhFinancialLedger.amountPaise} else 0 end), 0)`,
      settled: sql<number>`coalesce(sum(case when ${fyhFinancialLedger.kind} in ('payment_received', 'receivable_settled') and ${fyhFinancialLedger.account} = 'accounts_receivable' and ${fyhFinancialLedger.direction} = 'credit' then ${fyhFinancialLedger.amountPaise} else 0 end), 0)`,
    })
    .from(fyhFinancialLedger)
    .where(
      and(orgFilter(fyhFinancialLedger.organizationId, ctx), eq(fyhFinancialLedger.customerId, customerId)),
    );
  return Math.max(0, Number(row?.open ?? 0) - Number(row?.settled ?? 0));
}

export async function creditWalletAdvance(
  db: typeof hairDb,
  input: {
    customerId: string;
    invoiceId: string | null;
    amountPaise: number;
    reference?: string | null;
  },
  ctx?: TenantContext | null,
) {
  if (input.amountPaise <= 0) return;
  await postLedgerEntries(
    db,
    {
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      entries: [
        {
          account: 'customer_wallet',
          direction: 'credit',
          amountPaise: input.amountPaise,
          method: null,
          kind: 'advance_credit',
          reference: input.reference ?? null,
        },
      ],
    },
    ctx,
  );
  await reconcileCustomerWalletCache(db, input.customerId, ctx);
}
