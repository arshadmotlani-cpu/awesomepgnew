import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhCustomerMemberships,
  fyhCustomerPackageCredits,
  fyhCustomerPackages,
  fyhCustomers,
  fyhFinancialLedger,
  fyhInvoices,
  fyhMembershipPlans,
  fyhPackagePlans,
} from '@/src/hair/db/schema';
import { excludeVoidInvoiceLedger } from '@/src/hair/domain/ledger/service';
import {
  CLIENT_LIST_PAGE_SIZE,
  advanceBalanceFromLedgerEntries,
  duesFromLedgerTotals,
  membershipListLabel,
  packageListLabel,
  visitDateBounds,
} from '@/src/hair/lib/clientList';
import { salonDayBounds } from '@/src/hair/lib/salonTime';
import { normalizePhone } from '@/src/hair/services/customers';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type ClientListRow = {
  id: string;
  fullName: string;
  customerCode: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  rewardPoints: number;
  membershipLabel: string | null;
  packageLabel: string | null;
  /** Ledger advance/wallet. Null only after a field mask. */
  walletPaise: number | null;
  /** Ledger dues. Null only after a field mask. */
  outstandingPaise: number | null;
  firstVisitOn: string | null;
  lastVisitOn: string | null;
};

export type ClientListPage = {
  rows: ClientListRow[];
  total: number;
  page: number;
  pageSize: number;
};

function todayYmd(timezone: string): string {
  return salonDayBounds(timezone).dayKey;
}

function dayKey(timezone: string, value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return salonDayBounds(timezone, date).dayKey;
}

export async function listClientDirectory(
  opts: { q?: string; page?: number; pageSize?: number; timezone?: string },
  ctx?: TenantContext | null,
): Promise<ClientListPage> {
  ctx = await resolveTenantContextForService(ctx);
  const timezone = opts.timezone?.trim() || 'Asia/Kolkata';
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? CLIENT_LIST_PAGE_SIZE));
  const requestedPage = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const conditions = [orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.isActive, true)];
  if (q) {
    const pattern = `%${q}%`;
    const digits = normalizePhone(q);
    conditions.push(
      or(
        ilike(fyhCustomers.fullName, pattern),
        ilike(fyhCustomers.customerCode, pattern),
        ilike(fyhCustomers.phone, pattern),
        ilike(fyhCustomers.whatsapp, pattern),
        ilike(fyhCustomers.email, pattern),
        digits.length >= 4 ? ilike(fyhCustomers.phone, `%${digits}%`) : undefined,
        digits.length >= 4 ? ilike(fyhCustomers.whatsapp, `%${digits}%`) : undefined,
      )!,
    );
  }
  const where = and(...conditions);

  const [countRow] = await hairDb.select({ total: count() }).from(fyhCustomers).where(where);
  const total = Number(countRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;

  const customers = await hairDb
    .select({
      id: fyhCustomers.id,
      fullName: fyhCustomers.fullName,
      customerCode: fyhCustomers.customerCode,
      phone: fyhCustomers.phone,
      whatsapp: fyhCustomers.whatsapp,
      email: fyhCustomers.email,
      gender: fyhCustomers.gender,
      dateOfBirth: fyhCustomers.dateOfBirth,
      rewardPoints: fyhCustomers.rewardPoints,
    })
    .from(fyhCustomers)
    .where(where)
    .orderBy(desc(fyhCustomers.updatedAt), asc(fyhCustomers.fullName))
    .limit(pageSize)
    .offset(offset);

  const ids = customers.map((row) => row.id);
  const overlays = await loadClientOverlays(ids, timezone, ctx);
  return {
    total,
    page,
    pageSize,
    rows: customers.map((row) => ({
      ...row,
      rewardPoints: Number(row.rewardPoints ?? 0),
      membershipLabel: overlays.membership.get(row.id) ?? null,
      packageLabel: overlays.packages.get(row.id) ?? null,
      walletPaise: overlays.advance.get(row.id) ?? 0,
      outstandingPaise: overlays.dues.get(row.id) ?? 0,
      firstVisitOn: overlays.visits.get(row.id)?.firstVisitOn ?? null,
      lastVisitOn: overlays.visits.get(row.id)?.lastVisitOn ?? null,
    })),
  };
}

async function loadClientOverlays(
  ids: string[],
  timezone: string,
  ctx: TenantContext | null,
) {
  const membership = new Map<string, string | null>();
  const packages = new Map<string, string | null>();
  const advance = new Map<string, number>();
  const dues = new Map<string, number>();
  const visits = new Map<string, { firstVisitOn: string | null; lastVisitOn: string | null }>();
  if (!ids.length) return { membership, packages, advance, dues, visits };

  const today = todayYmd(timezone);
  const [ledgerRows, membershipRows, packageRows, invoiceRows, appointmentRows] = await Promise.all([
    hairDb
      .select({
        customerId: fyhFinancialLedger.customerId,
        kind: fyhFinancialLedger.kind,
        direction: fyhFinancialLedger.direction,
        account: fyhFinancialLedger.account,
        amountPaise: fyhFinancialLedger.amountPaise,
      })
      .from(fyhFinancialLedger)
      .leftJoin(fyhInvoices, eq(fyhInvoices.id, fyhFinancialLedger.invoiceId))
      .where(
        and(
          orgFilter(fyhFinancialLedger.organizationId, ctx),
          inArray(fyhFinancialLedger.customerId, ids),
          excludeVoidInvoiceLedger(),
        ),
      ),
    hairDb
      .select({
        customerId: fyhCustomerMemberships.customerId,
        planName: fyhMembershipPlans.name,
        discountBps: fyhMembershipPlans.discountBps,
        createdAt: fyhCustomerMemberships.createdAt,
      })
      .from(fyhCustomerMemberships)
      .innerJoin(fyhMembershipPlans, eq(fyhMembershipPlans.id, fyhCustomerMemberships.planId))
      .where(
        and(
          orgFilter(fyhCustomerMemberships.organizationId, ctx),
          inArray(fyhCustomerMemberships.customerId, ids),
          eq(fyhCustomerMemberships.isActive, true),
          gte(fyhCustomerMemberships.expiresOn, today),
        ),
      )
      .orderBy(desc(fyhCustomerMemberships.createdAt)),
    hairDb
      .select({
        customerId: fyhCustomerPackages.customerId,
        nameSnapshot: fyhCustomerPackages.nameSnapshot,
        planName: fyhPackagePlans.name,
        totalCredits: fyhCustomerPackageCredits.totalCredits,
        usedCredits: fyhCustomerPackageCredits.usedCredits,
      })
      .from(fyhCustomerPackageCredits)
      .innerJoin(
        fyhCustomerPackages,
        eq(fyhCustomerPackages.id, fyhCustomerPackageCredits.customerPackageId),
      )
      .innerJoin(fyhPackagePlans, eq(fyhPackagePlans.id, fyhCustomerPackages.planId))
      .where(
        and(
          orgFilter(fyhCustomerPackages.organizationId, ctx),
          inArray(fyhCustomerPackages.customerId, ids),
          eq(fyhCustomerPackages.isActive, true),
          eq(fyhCustomerPackages.isFrozen, false),
          or(isNull(fyhCustomerPackages.expiresOn), gte(fyhCustomerPackages.expiresOn, today)),
          sql`${fyhCustomerPackageCredits.usedCredits} < ${fyhCustomerPackageCredits.totalCredits}`,
        ),
      ),
    hairDb
      .select({
        customerId: fyhInvoices.customerId,
        createdAt: fyhInvoices.createdAt,
      })
      .from(fyhInvoices)
      .where(
        and(
          orgFilter(fyhInvoices.organizationId, ctx),
          inArray(fyhInvoices.customerId, ids),
          sql`${fyhInvoices.status} in ('paid', 'partial', 'unpaid')`,
          ne(fyhInvoices.source, 'advance_payment'),
        ),
      ),
    hairDb
      .select({
        customerId: fyhAppointments.customerId,
        startAt: fyhAppointments.startAt,
      })
      .from(fyhAppointments)
      .where(
        and(
          orgFilter(fyhAppointments.organizationId, ctx),
          inArray(fyhAppointments.customerId, ids),
          sql`${fyhAppointments.status} in ('completed', 'paid')`,
        ),
      ),
  ]);

  const ledgerByCustomer = new Map<string, typeof ledgerRows>();
  for (const row of ledgerRows) {
    const list = ledgerByCustomer.get(row.customerId) ?? [];
    list.push(row);
    ledgerByCustomer.set(row.customerId, list);
  }
  for (const id of ids) {
    const entries = ledgerByCustomer.get(id) ?? [];
    advance.set(
      id,
      advanceBalanceFromLedgerEntries(
        entries.map((entry) => ({
          kind: entry.kind,
          direction: entry.direction,
          amountPaise: Number(entry.amountPaise ?? 0),
        })),
      ),
    );
    const open = entries.reduce(
      (sum, entry) =>
        entry.kind === 'receivable_open' && entry.direction === 'debit'
          ? sum + Number(entry.amountPaise ?? 0)
          : sum,
      0,
    );
    const settled = entries.reduce(
      (sum, entry) =>
        entry.account === 'accounts_receivable' &&
        entry.direction === 'credit' &&
        (entry.kind === 'payment_received' || entry.kind === 'receivable_settled')
          ? sum + Number(entry.amountPaise ?? 0)
          : sum,
      0,
    );
    dues.set(id, duesFromLedgerTotals(open, settled));
  }

  const seenMembership = new Set<string>();
  for (const row of membershipRows) {
    if (seenMembership.has(row.customerId)) continue;
    seenMembership.add(row.customerId);
    membership.set(
      row.customerId,
      membershipListLabel({ planName: row.planName, discountBps: Number(row.discountBps ?? 0) }),
    );
  }

  const packageBuckets = new Map<string, { names: string[]; remainingCredits: number }>();
  for (const row of packageRows) {
    const bucket = packageBuckets.get(row.customerId) ?? { names: [], remainingCredits: 0 };
    const name = row.nameSnapshot?.trim() || row.planName;
    if (name) bucket.names.push(name);
    bucket.remainingCredits += Math.max(0, Number(row.totalCredits ?? 0) - Number(row.usedCredits ?? 0));
    packageBuckets.set(row.customerId, bucket);
  }
  for (const [id, bucket] of packageBuckets) {
    packages.set(id, packageListLabel(bucket));
  }

  const visitKeys = new Map<string, string[]>();
  const pushVisit = (customerId: string, at: Date | null) => {
    const key = dayKey(timezone, at);
    if (!key) return;
    const list = visitKeys.get(customerId) ?? [];
    list.push(key);
    visitKeys.set(customerId, list);
  };
  for (const row of invoiceRows) pushVisit(row.customerId, row.createdAt);
  for (const row of appointmentRows) pushVisit(row.customerId, row.startAt);
  for (const [id, keys] of visitKeys) visits.set(id, visitDateBounds(keys));

  return { membership, packages, advance, dues, visits };
}
