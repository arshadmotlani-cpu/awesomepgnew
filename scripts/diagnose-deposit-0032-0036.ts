/**
 * Read-only: deposit ledger state for APG-2026-0032 and APG-2026-0036.
 */
import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { createClient } from '../src/db/client';
import { auditLog, bookings, depositLedger } from '../src/db/schema';
import { getDepositInvoiceForBooking } from '../src/services/depositInvoices';
import { getUnifiedDepositView } from '../src/services/depositOperations';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { depositAdminDisplayAmounts } from '../src/lib/deposits/unifiedDepositView';

const CODES = ['APG-2026-0032', 'APG-2026-0036'] as const;

async function ledgerSum(db: ReturnType<typeof createClient>['db'], bookingId: string) {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint`,
    })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId));
  return Number(row?.balance ?? 0);
}

async function main() {
  const { db, close } = createClient();
  try {
    const out: Record<string, unknown> = {};
    for (const code of CODES) {
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.bookingCode, code))
        .limit(1);
      if (!booking) {
        out[code] = { error: 'not found' };
        continue;
      }

      const ledger = await db
        .select()
        .from(depositLedger)
        .where(eq(depositLedger.bookingId, booking.id))
        .orderBy(depositLedger.createdAt);

      const audits = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entity, 'booking'),
            eq(auditLog.entityId, booking.id),
          ),
        )
        .orderBy(sql`${auditLog.createdAt} DESC`)
        .limit(20);

      const summary = await getDepositSummaryForBooking(booking.id);
      const invoice = await getDepositInvoiceForBooking(booking.id);
      const unified = await getUnifiedDepositView(booking.id);

      const display = depositAdminDisplayAmounts({
        grossCollectedPaise: invoice?.collectedPaise ?? summary?.collectedPaise ?? 0,
        grossDeductedPaise: summary?.deductedPaise ?? 0,
        grossRefundedPaise: summary?.refundedPaise ?? 0,
        grossRefundableBalancePaise: summary?.refundableBalancePaise ?? 0,
        requiredPaise: booking.depositPaise,
        depositDuePaise: booking.depositDuePaise,
        taggedCollectionAdjustmentPaise: 0,
      });

      out[code] = {
        bookingId: booking.id,
        status: booking.status,
        depositPaise: booking.depositPaise,
        depositDuePaise: booking.depositDuePaise,
        depositCollectionStatus: booking.depositCollectionStatus,
        ledgerSumPaise: await ledgerSum(db, booking.id),
        ledger: ledger.map((r) => ({
          id: r.id,
          entryKind: r.entryKind,
          amountPaise: r.amountPaise,
          reason: r.reason,
          createdAt: r.createdAt,
        })),
        summary: summary
          ? {
              collectedPaise: summary.collectedPaise,
              deductedPaise: summary.deductedPaise,
              refundedPaise: summary.refundedPaise,
              refundableBalancePaise: summary.refundableBalancePaise,
            }
          : null,
        invoice: invoice
          ? {
              invoiceStatus: invoice.invoiceStatus,
              displayStatus: invoice.displayStatus,
              requiredPaise: invoice.requiredPaise,
              collectedPaise: invoice.collectedPaise,
              refundablePaise: invoice.refundablePaise,
              depositDuePaise: invoice.depositDuePaise,
            }
          : null,
        unified: unified
          ? {
              collectedPaise: unified.collectedPaise,
              refundablePaise: unified.refundablePaise,
              depositDuePaise: unified.depositDuePaise,
              depositCollectionStatus: unified.depositCollectionStatus,
              invoiceStatus: unified.invoiceStatus,
            }
          : null,
        display,
        audits: audits.map((a) => ({
          id: a.id,
          action: a.action,
          createdAt: a.createdAt,
          diff: a.diff,
        })),
      };
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
