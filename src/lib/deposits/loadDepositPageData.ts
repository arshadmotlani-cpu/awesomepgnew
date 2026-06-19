/**
 * Shared deposit page data loader + prop inspection for debug page and production page.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, customers, depositLedger } from '@/src/db/schema';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getDepositInvoiceForBooking } from '@/src/services/depositInvoices';
import { getUnifiedDepositView, sanitizeUnifiedDepositView } from '@/src/services/depositOperations';
import { loadBedPrice, securityDepositForMode } from '@/src/services/pricing';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { findUnsafeFields, jsonSafe, type UnsafeField } from '@/src/lib/depositPageDebug';
import {
  auditSerialization,
  logDepositPageLoadFailed,
  logDepositPageLoadStart,
  logDepositPageLoadSuccess,
  type DepositInvestigationContext,
} from '@/src/lib/depositInvestigation';

export type DepositPageLoadResult = {
  booking: {
    id: string;
    bookingCode: string;
    durationMode: string;
    status: string;
    depositPaise: number;
    customerId: string;
    customerFullName: string | null;
    customerPhone: string | null;
  } | null;
  customerId: string | null;
  invoice: Awaited<ReturnType<typeof getDepositInvoiceForBooking>>;
  summary: Awaited<ReturnType<typeof getDepositSummaryForBooking>>;
  unifiedView: ReturnType<typeof sanitizeUnifiedDepositView> | null;
  requiredPaise: number;
  collectedPaise: number;
  deductionsPaise: number;
  refundablePaise: number;
  isFrozen: boolean;
  websiteDepositPaise: number;
  hasPrimaryBedReservation: boolean;
  loadError: string | null;
  walletProps: { view: NonNullable<ReturnType<typeof sanitizeUnifiedDepositView>>; isFrozen: boolean } | null;
  adjustProps: {
    bookingId: string;
    bookingDepositPaise: number;
    ledgerCollectedPaise: number;
    websiteDepositPaise: number;
  } | null;
  settlementProps: {
    bookingId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    depositHeldPaise: number;
    depositPaidPaise: number;
    depositRefundablePaise: number;
  } | null;
};

export type PropInspection = {
  path: string;
  typeof: string;
  value: string;
  isNull: boolean;
  isUndefined: boolean;
  isBigInt: boolean;
};

function describePropValue(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(jsonSafe(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function inspectProps(value: unknown, prefix = 'root'): PropInspection[] {
  const out: PropInspection[] = [];
  if (value === null || value === undefined || typeof value !== 'object') {
    out.push({
      path: prefix,
      typeof: value === null ? 'null' : typeof value,
      value: describePropValue(value),
      isNull: value === null,
      isUndefined: value === undefined,
      isBigInt: typeof value === 'bigint',
    });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push(...inspectProps(item, `${prefix}[${i}]`)));
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix === 'root' ? key : `${prefix}.${key}`;
    if (child !== null && typeof child === 'object' && !(child instanceof Date) && !Array.isArray(child)) {
      out.push(...inspectProps(child, path));
    } else {
      out.push({
        path,
        typeof: child === null ? 'null' : child instanceof Date ? 'Date' : typeof child,
        value: describePropValue(child),
        isNull: child === null,
        isUndefined: child === undefined,
        isBigInt: typeof child === 'bigint',
      });
    }
  }
  return out;
}

export function logPropInspection(label: string, bookingId: string, value: unknown) {
  const fields = inspectProps(value, label);
  const unsafe = findUnsafeFields(value);
  const flagged = fields.filter(
    (f) => f.isBigInt || f.isNull || f.isUndefined || f.typeof === 'Date' || f.typeof === 'function',
  );
  console.error('[DEPOSIT_PROP_INSPECT]', jsonSafe({ label, bookingId, flagged, unsafe, allCount: fields.length }));
  return { fields, unsafe, flagged };
}

/** Log raw driver types for bigint columns — production Neon may differ from local. */
async function auditRawBigIntSources(bookingId: string, customerId: string, bookingCode: string) {
  const [bookingRow] = await db
    .select({
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      totalPaise: bookings.totalPaise,
      subtotalPaise: bookings.subtotalPaise,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  const ledgerRows = await db
    .select({ amountPaise: depositLedger.amountPaise })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId))
    .limit(20);

  const rawSql = await db.execute(sql`
    SELECT
      b.deposit_paise,
      b.deposit_due_paise,
      (SELECT coalesce(sum(amount_paise),0)::bigint FROM deposit_ledger WHERE booking_id = b.id) AS ledger_sum_bigint
    FROM bookings b
    WHERE b.id = ${bookingId}::uuid
  `);

  const typeOf = (v: unknown) =>
    v === null ? 'null' : v instanceof Date ? 'Date' : typeof v;

  const fieldTypes: Record<string, string> = {};
  if (bookingRow) {
    for (const [k, v] of Object.entries(bookingRow)) {
      fieldTypes[`bookings.${k}`] = typeOf(v);
    }
  }
  ledgerRows.forEach((row, i) => {
    fieldTypes[`deposit_ledger[${i}].amountPaise`] = typeOf(row.amountPaise);
  });

  console.error(
    '[DEPOSIT_PAGE_LOAD_SUCCESS]',
    jsonSafe({
      phase: 'bigint_source_audit',
      bookingId,
      bookingCode,
      customerId,
      drizzleFieldTypes: fieldTypes,
      rawSqlRow: rawSql[0] ?? null,
      rawSqlTypes: rawSql[0]
        ? Object.fromEntries(
            Object.entries(rawSql[0] as Record<string, unknown>).map(([k, v]) => [k, typeOf(v)]),
          )
        : null,
      bigintInDrizzle: Object.entries(fieldTypes).filter(([, t]) => t === 'bigint'),
      bigintInRawSql: rawSql[0]
        ? Object.entries(rawSql[0] as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'bigint')
            .map(([k]) => k)
        : [],
    }),
  );
}

export async function loadDepositPageData(bookingId: string): Promise<DepositPageLoadResult> {
  const ctx: DepositInvestigationContext = { bookingId, component: 'loadDepositPageData' };
  logDepositPageLoadStart(ctx);

  const empty: DepositPageLoadResult = {
    booking: null,
    customerId: null,
    invoice: null,
    summary: null,
    unifiedView: null,
    requiredPaise: 0,
    collectedPaise: 0,
    deductionsPaise: 0,
    refundablePaise: 0,
    isFrozen: false,
    websiteDepositPaise: 0,
    hasPrimaryBedReservation: false,
    loadError: null,
    walletProps: null,
    adjustProps: null,
    settlementProps: null,
  };

  try {
    const [booking] = await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        durationMode: bookings.durationMode,
        status: bookings.status,
        depositPaise: bookings.depositPaise,
        customerId: bookings.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      logDepositPageLoadFailed(ctx, new Error('Booking not found (or customer join failed)'));
      return { ...empty, loadError: 'Booking not found (or customer join failed)' };
    }

    ctx.bookingCode = booking.bookingCode;
    ctx.customerId = booking.customerId;

    let invoice: DepositPageLoadResult['invoice'] = null;
    let summary: DepositPageLoadResult['summary'] = null;
    let unifiedView: DepositPageLoadResult['unifiedView'] = null;
    let loadError: string | null = null;

    try {
      invoice = await getDepositInvoiceForBooking(bookingId);
    } catch (err) {
      loadError = `invoice: ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      summary = await getDepositSummaryForBooking(bookingId);
    } catch (err) {
      loadError = loadError ?? `summary: ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      const raw = await getUnifiedDepositView(bookingId);
      unifiedView = raw ? sanitizeUnifiedDepositView(raw) : null;
    } catch (err) {
      loadError = loadError ?? `unifiedView: ${err instanceof Error ? err.message : String(err)}`;
    }

    const requiredPaise = guardDepositPaise(invoice?.requiredPaise ?? booking.depositPaise, 'requiredPaise');
    const collectedPaise = guardDepositPaise(
      invoice?.collectedPaise ?? summary?.collectedPaise ?? 0,
      'collectedPaise',
    );
    const deductionsPaise = guardDepositPaise(
      invoice?.deductionsPaise ?? (summary?.deductedPaise ?? 0) + (summary?.refundedPaise ?? 0),
      'deductionsPaise',
    );
    const refundablePaise = guardDepositPaise(
      invoice?.refundablePaise ?? summary?.refundableBalancePaise ?? 0,
      'refundablePaise',
    );
    const isFrozen = invoice?.isFrozen ?? false;

    let hasPrimaryBedReservation = false;
    let websiteDepositPaise = 0;
    const [primaryBed] = await db
      .select({
        bedId: bedReservations.bedId,
        moveInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      })
      .from(bedReservations)
      .where(
        and(
          eq(bedReservations.bookingId, bookingId),
          eq(bedReservations.kind, 'primary'),
          eq(bedReservations.status, 'active'),
        ),
      )
      .limit(1);

    hasPrimaryBedReservation = Boolean(primaryBed);
    if (primaryBed?.bedId && primaryBed.moveInDate) {
      try {
        const bedRate = await loadBedPrice(primaryBed.bedId, primaryBed.moveInDate);
        if (bedRate) {
          websiteDepositPaise = guardDepositPaise(
            securityDepositForMode(
              bedRate,
              booking.durationMode === 'open_ended' ? 'open_ended' : 'monthly',
            ),
            'websiteDepositPaise',
          );
        }
      } catch (err) {
        loadError = loadError ?? `pricing: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const walletProps = unifiedView
      ? jsonSafe({
          view: sanitizeUnifiedDepositView(unifiedView),
          isFrozen,
        })
      : null;
    const adjustProps = jsonSafe({
      bookingId,
      bookingDepositPaise: guardDepositPaise(booking.depositPaise, 'booking.depositPaise'),
      ledgerCollectedPaise: collectedPaise,
      websiteDepositPaise: guardDepositPaise(websiteDepositPaise, 'websiteDepositPaise'),
    });
    const settlementProps =
      refundablePaise > 0 || booking.status === 'completed'
        ? jsonSafe({
            bookingId,
            customerId: booking.customerId,
            customerName: booking.customerFullName ?? '',
            customerPhone: booking.customerPhone ?? '',
            depositHeldPaise: collectedPaise,
            depositPaidPaise: collectedPaise,
            depositRefundablePaise: refundablePaise,
          })
        : null;

    logPropInspection('walletProps', bookingId, walletProps);
    logPropInspection('adjustProps', bookingId, adjustProps);
    logPropInspection('settlementProps', bookingId, settlementProps);

    const result = {
      booking: {
        ...booking,
        depositPaise: guardDepositPaise(booking.depositPaise, 'booking.depositPaise'),
      },
      customerId: booking.customerId,
      invoice,
      summary,
      unifiedView,
      requiredPaise,
      collectedPaise,
      deductionsPaise,
      refundablePaise,
      isFrozen,
      websiteDepositPaise,
      hasPrimaryBedReservation,
      loadError,
      walletProps,
      adjustProps,
      settlementProps,
    };

    logDepositPageLoadSuccess(ctx, {
      bookingCode: booking.bookingCode,
      customerId: booking.customerId,
      hasInvoice: Boolean(invoice),
      hasSummary: Boolean(summary),
      hasUnifiedView: Boolean(unifiedView),
      hasWalletProps: Boolean(walletProps),
      hasAdjustProps: Boolean(adjustProps),
      hasSettlementProps: Boolean(settlementProps),
      loadError,
      walletProps: walletProps ? auditSerialization(walletProps) : null,
      adjustProps: adjustProps ? auditSerialization(adjustProps) : null,
      settlementProps: settlementProps ? auditSerialization(settlementProps) : null,
    });

    await auditRawBigIntSources(bookingId, booking.customerId, booking.bookingCode);

    return result;
  } catch (err) {
    logDepositPageLoadFailed(ctx, err);
    return {
      ...empty,
      loadError: err instanceof Error ? err.message : String(err),
    };
  }
}
