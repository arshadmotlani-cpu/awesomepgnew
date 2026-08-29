import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomers,
  fyhInvoiceLines,
  fyhInvoicePayments,
  fyhInvoices,
  type FyhInvoiceStatus,
  type FyhPaymentMethod,
} from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { salonTodayKey } from '@/src/hair/lib/appointmentDate';

export const DEFAULT_REGISTER_PAGE_SIZE = 50;

export type InvoiceRegisterFilters = {
  q?: string;
  from?: Date;
  to?: Date;
  customer?: string;
  mobile?: string;
  invoiceNumber?: string;
  paymentMode?: FyhPaymentMethod;
  status?: FyhInvoiceStatus;
  page?: number;
  pageSize?: number;
  sort?: 'created_at' | 'invoice_number' | 'grand_total_paise';
  sortDir?: 'asc' | 'desc';
};

export type InvoiceRegisterRow = {
  id: string;
  invoiceNumber: string;
  publicAccessToken: string;
  invoiceDate: Date;
  customerName: string;
  mobile: string;
  servicesSummary: string;
  paymentModes: string;
  taxablePaise: number;
  gstPaise: number;
  grandTotalPaise: number;
  paidPaise: number;
  status: FyhInvoiceStatus;
};

export type InvoiceRegisterResult = {
  rows: InvoiceRegisterRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

function pageLimit(filters: InvoiceRegisterFilters): number {
  return Math.min(Math.max(filters.pageSize ?? DEFAULT_REGISTER_PAGE_SIZE, 1), 200);
}

function pageOffset(filters: InvoiceRegisterFilters, limit: number): number {
  const page = Math.max(filters.page ?? 1, 1);
  return (page - 1) * limit;
}

/** Exclude Quick Sale hold drafts from the register. */
function baseVisibility(): SQL {
  return or(
    ne(fyhInvoices.status, 'draft'),
    ne(fyhInvoices.source, 'quick_sale'),
  )!;
}

function buildWhere(filters: InvoiceRegisterFilters): SQL | undefined {
  const parts: SQL[] = [baseVisibility()];

  if (filters.from) {
    parts.push(gte(fyhInvoices.createdAt, filters.from));
  }
  if (filters.to) {
    parts.push(lt(fyhInvoices.createdAt, filters.to));
  }
  if (filters.customer?.trim()) {
    parts.push(ilike(fyhCustomers.fullName, `%${filters.customer.trim()}%`));
  }
  if (filters.mobile?.trim()) {
    parts.push(ilike(fyhCustomers.phone, `%${filters.mobile.trim()}%`));
  }
  if (filters.invoiceNumber?.trim()) {
    parts.push(ilike(fyhInvoices.invoiceNumber, `%${filters.invoiceNumber.trim()}%`));
  }
  if (filters.status) {
    parts.push(eq(fyhInvoices.status, filters.status));
  }
  if (filters.paymentMode) {
    parts.push(
      exists(
        hairDb
          .select({ one: sql`1` })
          .from(fyhInvoicePayments)
          .where(
            and(
              eq(fyhInvoicePayments.invoiceId, fyhInvoices.id),
              eq(fyhInvoicePayments.method, filters.paymentMode!),
            ),
          ),
      ),
    );
  }

  const q = filters.q?.trim();
  if (q) {
    const lineMatch = exists(
      hairDb
        .select({ one: sql`1` })
        .from(fyhInvoiceLines)
        .where(
          and(
            eq(fyhInvoiceLines.invoiceId, fyhInvoices.id),
            ilike(fyhInvoiceLines.nameSnapshot, `%${q}%`),
          ),
        ),
    );
    parts.push(
      or(
        ilike(fyhInvoices.invoiceNumber, `%${q}%`),
        ilike(fyhCustomers.fullName, `%${q}%`),
        ilike(fyhCustomers.phone, `%${q}%`),
        lineMatch,
      )!,
    );
  }

  return and(...parts);
}

function sortClause(filters: InvoiceRegisterFilters) {
  const dir = filters.sortDir === 'asc' ? asc : desc;
  switch (filters.sort) {
    case 'invoice_number':
      return dir(fyhInvoices.invoiceNumber);
    case 'grand_total_paise':
      return dir(fyhInvoices.grandTotalPaise);
    default:
      return dir(fyhInvoices.createdAt);
  }
}

const PAYMENT_LABELS: Record<FyhPaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank',
  wallet: 'Wallet',
  gift_card: 'Gift card',
};

async function attachLinesAndPayments(rows: InvoiceRegisterRow[]): Promise<InvoiceRegisterRow[]> {
  if (!rows.length) return rows;

  const ids = rows.map((r) => r.id);
  const [lineRows, paymentRows] = await Promise.all([
    hairDb
      .select({
        invoiceId: fyhInvoiceLines.invoiceId,
        nameSnapshot: fyhInvoiceLines.nameSnapshot,
      })
      .from(fyhInvoiceLines)
      .where(inArray(fyhInvoiceLines.invoiceId, ids))
      .orderBy(fyhInvoiceLines.sortOrder),
    hairDb
      .select({
        invoiceId: fyhInvoicePayments.invoiceId,
        method: fyhInvoicePayments.method,
      })
      .from(fyhInvoicePayments)
      .where(inArray(fyhInvoicePayments.invoiceId, ids)),
  ]);

  const servicesByInvoice = new Map<string, string[]>();
  for (const line of lineRows) {
    const list = servicesByInvoice.get(line.invoiceId) ?? [];
    list.push(line.nameSnapshot);
    servicesByInvoice.set(line.invoiceId, list);
  }

  const modesByInvoice = new Map<string, Set<string>>();
  for (const pay of paymentRows) {
    const set = modesByInvoice.get(pay.invoiceId) ?? new Set<string>();
    set.add(PAYMENT_LABELS[pay.method] ?? pay.method);
    modesByInvoice.set(pay.invoiceId, set);
  }

  return rows.map((row) => ({
    ...row,
    servicesSummary: (servicesByInvoice.get(row.id) ?? []).join(', '),
    paymentModes: [...(modesByInvoice.get(row.id) ?? [])].join(', ') || '—',
  }));
}

export async function queryInvoiceRegister(
  filters: InvoiceRegisterFilters = {}, ctx?: TenantContext | null): Promise<InvoiceRegisterResult> {
  const limit = pageLimit(filters);
  const offset = pageOffset(filters, limit);
  const where = buildWhere(filters);

  const [countRow] = await hairDb
    .select({ total: count() })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(where);

  const invoiceRows = await hairDb
    .select({
      id: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      publicAccessToken: fyhInvoices.publicAccessToken,
      invoiceDate: fyhInvoices.createdAt,
      customerName: fyhCustomers.fullName,
      mobile: fyhCustomers.phone,
      taxablePaise: fyhInvoices.subtotalPaise,
      gstPaise: fyhInvoices.taxPaise,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      paidPaise: fyhInvoices.amountPaidPaise,
      status: fyhInvoices.status,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(where)
    .orderBy(sortClause(filters))
    .limit(limit)
    .offset(offset);

  const rows = await attachLinesAndPayments(
    invoiceRows.map((r) => ({
      ...r,
      servicesSummary: '',
      paymentModes: '',
    })),
  );

  return {
    rows,
    totalCount: Number(countRow?.total ?? 0),
    page: Math.max(filters.page ?? 1, 1),
    pageSize: limit,
  };
}

/** Fetch all rows matching filters for export (capped). */
export async function queryInvoiceRegisterForExport(
  filters: InvoiceRegisterFilters = {},
  maxRows = 10_000, ctx?: TenantContext | null): Promise<InvoiceRegisterRow[]> {
  const where = buildWhere(filters);
  const invoiceRows = await hairDb
    .select({
      id: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      publicAccessToken: fyhInvoices.publicAccessToken,
      invoiceDate: fyhInvoices.createdAt,
      customerName: fyhCustomers.fullName,
      mobile: fyhCustomers.phone,
      taxablePaise: fyhInvoices.subtotalPaise,
      gstPaise: fyhInvoices.taxPaise,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      paidPaise: fyhInvoices.amountPaidPaise,
      status: fyhInvoices.status,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(where)
    .orderBy(desc(fyhInvoices.createdAt))
    .limit(maxRows);

  return attachLinesAndPayments(
    invoiceRows.map((r) => ({
      ...r,
      servicesSummary: '',
      paymentModes: '',
    })),
  );
}

export function parseRegisterFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): InvoiceRegisterFilters {
  const pick = (key: string) => {
    const v = params[key];
    return typeof v === 'string' ? v.trim() : '';
  };

  const page = Number.parseInt(pick('page'), 10);
  const pageSize = Number.parseInt(pick('pageSize'), 10);
  const fromStr = pick('from');
  const toStr = pick('to');

  const paymentMode = pick('paymentMode');
  const status = pick('status');

  return {
    q: pick('q') || undefined,
    from: fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined,
    to: toStr ? new Date(`${toStr}T23:59:59.999Z`) : undefined,
    customer: pick('customer') || undefined,
    mobile: pick('mobile') || undefined,
    invoiceNumber: pick('invoiceNumber') || undefined,
    paymentMode: (paymentMode || undefined) as FyhPaymentMethod | undefined,
    status: (status || undefined) as FyhInvoiceStatus | undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : DEFAULT_REGISTER_PAGE_SIZE,
    sort: (pick('sort') as InvoiceRegisterFilters['sort']) || 'created_at',
    sortDir: pick('sortDir') === 'asc' ? 'asc' : 'desc',
  };
}

/** True when `/billing/invoices` should redirect to today's salon-local date range. */
export function shouldDefaultInvoiceRegisterToToday(
  params: Record<string, string | string[] | undefined>,
): boolean {
  const pick = (key: string) => {
    const v = params[key];
    return typeof v === 'string' ? v.trim() : '';
  };
  if (pick('all') === '1') return false;
  if (pick('from') || pick('to')) return false;
  return true;
}

export function invoiceRegisterTodayIso(timezone = 'Asia/Kolkata'): string {
  return salonTodayKey(timezone);
}
