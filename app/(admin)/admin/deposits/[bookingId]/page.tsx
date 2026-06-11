import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, customers } from '@/src/db/schema';
import { PageHeader } from '@/src/components/admin/PageHeader';
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/src/components/admin/Table';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { listDepositLedgerEntriesForBooking } from '@/src/db/queries/admin';
import { DepositAdjustForms } from '@/src/components/admin/DepositAdjustForms';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { paiseToInr, formatDate, titleCase } from '@/src/lib/format';
import { loadBedPrice, securityDepositForMode } from '@/src/services/pricing';

export const dynamic = 'force-dynamic';

type RouteParams = { bookingId: string };

export default async function AdminDepositDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bookingId } = await params;

  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      durationMode: bookings.durationMode,
      status: bookings.status,
      depositPaise: bookings.depositPaise,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) notFound();

  const summary = await getDepositSummaryForBooking(bookingId);
  const ledger = await listDepositLedgerEntriesForBooking(bookingId);

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

  let websiteDepositPaise = 0;
  if (primaryBed) {
    const bedRate = await loadBedPrice(primaryBed.bedId, primaryBed.moveInDate);
    if (bedRate) {
      websiteDepositPaise = securityDepositForMode(
        bedRate,
        booking.durationMode === 'open_ended' ? 'open_ended' : 'monthly',
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Deposit ledger"
        description={`Booking ${booking.bookingCode} · ${booking.customerFullName} · ${booking.customerPhone}`}
        actions={
          <Link
            href="/admin/deposits"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            ← All deposits
          </Link>
        }
      />
      <div className="mt-4" />

      <DepositRefundNotice />

      <p className="mb-4 text-sm">
        <Link
          href={`/admin/bookings/${bookingId}`}
          className="font-medium text-indigo-600 hover:underline"
        >
          Open booking → Operations checklist
        </Link>{' '}
        to mark dues cleared, deposit refunded, and bed availability.
      </p>

      <section className="mb-4 mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Booking deposit" value={paiseToInr(booking.depositPaise)} />
        <Stat label="Collected (ledger)" value={paiseToInr(summary?.collectedPaise ?? 0)} />
        <Stat
          label="Deducted (ledger)"
          value={paiseToInr(summary?.deductedPaise ?? 0)}
          tone="warn"
        />
        <Stat
          label="Refundable balance"
          value={paiseToInr(summary?.refundableBalancePaise ?? 0)}
          tone="strong"
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Adjust deposit</h2>
        <DepositAdjustForms
          bookingId={bookingId}
          bookingDepositPaise={booking.depositPaise}
          ledgerCollectedPaise={summary?.collectedPaise ?? 0}
          websiteDepositPaise={websiteDepositPaise}
        />
        <p className="mt-2 text-[11px] text-zinc-500">
          Every form below writes one append-only ledger row + an audit-log
          entry. The DB enforces sign: collected &gt; 0, deducted &amp; refunded &lt; 0.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">
          Ledger history ({ledger.ok ? ledger.data.length : 0} entries)
        </h2>
        {ledger.ok ? (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Type</TH>
                <TH>Reason</TH>
                <TH>Linked to</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {ledger.data.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="py-4 text-center text-sm text-zinc-500">
                    No deposit movements yet.
                  </TD>
                </TR>
              ) : (
                ledger.data.map((row) => (
                  <TR key={row.id}>
                    <TD className="text-xs text-zinc-500">{formatDate(row.createdAt)}</TD>
                    <TD>{titleCase(row.entryKind)}</TD>
                    <TD className="text-xs">{row.reason}</TD>
                    <TD className="text-xs text-zinc-500">
                      {row.relatedPaymentId ? `payment ${row.relatedPaymentId.slice(0, 8)}` : ''}
                      {row.relatedVacatingId ? `vacating ${row.relatedVacatingId.slice(0, 8)}` : ''}
                    </TD>
                    <TD className="text-right tabular-nums font-medium">
                      {paiseToInr(row.amountPaise)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        ) : (
          <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Couldn&apos;t load the deposit ledger.
          </p>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'warn' | 'strong';
}) {
  const bg =
    tone === 'warn'
      ? 'border-rose-200 bg-rose-50'
      : tone === 'strong'
        ? 'border-indigo-200 bg-indigo-50'
        : 'border-zinc-200 bg-white';
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
