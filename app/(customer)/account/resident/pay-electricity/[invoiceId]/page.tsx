import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import { db } from '@/src/db/client';
import {
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  rooms,
} from '@/src/db/schema';
import {
  DEFAULT_ELECTRICITY_DAILY_QR_PATH,
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import { ElectricityPaymentProofForm } from '@/src/components/customer/ElectricityPaymentProofForm';
import { PaymentUnavailable } from '@/src/components/customer/PaymentUnavailable';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { isCloudinaryConfigured } from '@/src/lib/images/cloudinary';
import { isRazorpayConfigured } from '@/src/lib/payments/config';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import {
  ensureDefaultPaymentCategoriesForPg,
  getElectricityDailyCategory,
} from '@/src/services/pgPaymentDefaults';
import { requireCustomerSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

type RouteParams = { invoiceId: string };

export default async function PayElectricityPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { invoiceId } = await params;
  const session = await requireCustomerSession(`/account/resident/pay-electricity/${invoiceId}`);

  const [invoiceRow] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, invoiceId))
    .limit(1);
  if (!invoiceRow || invoiceRow.customerId !== session.customerId) notFound();

  const [row] = await db
    .select({
      bookingCode: bookings.bookingCode,
      customerFullName: customers.fullName,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      unitsConsumed: electricityBills.unitsConsumed,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      totalPaise: electricityBills.totalPaise,
      monthlyOccupantCount: electricityBills.monthlyOccupantCount,
      isEstimated: electricityBills.isEstimated,
      unitsShare: electricityInvoices.unitsShare,
      activeDays: electricityInvoices.activeDays,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      pgId: floors.pgId,
    })
    .from(electricityInvoices)
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(electricityInvoices.id, invoiceId))
    .limit(1);
  if (!row) notFound();

  const projection = projectElectricityInvoice(invoiceRow);
  const outstanding = projection.outstandingPaise;
  const cloudinary = isCloudinaryConfigured();

  await ensureDefaultPaymentCategoriesForPg(row.pgId);
  const elecCategory = await getElectricityDailyCategory(row.pgId);

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link
          href="/account/resident"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          ← Back to resident dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Pay electricity
        </h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">
          {invoiceRow.invoiceNumber}
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-zinc-500">Resident</dt>
          <dd className="text-right font-medium">{row.customerFullName}</dd>
          <dt className="text-zinc-500">Bed</dt>
          <dd className="text-right font-medium">
            Room {row.roomNumber} · Bed {row.bedCode}
          </dd>
          <dt className="text-zinc-500">Billing month</dt>
          <dd className="text-right font-medium">{formatDate(invoiceRow.billingMonth)}</dd>
          <dt className="text-zinc-500">Meter readings</dt>
          <dd className="text-right">
            {row.previousReadingUnits} → {row.currentReadingUnits}
          </dd>
          <dt className="text-zinc-500">Room total</dt>
          <dd className="text-right">
            {row.unitsConsumed} units × {paiseToInr(row.ratePerUnitPaise)} ={' '}
            {paiseToInr(row.totalPaise)}
          </dd>
          <dt className="text-zinc-500">Your share</dt>
          <dd className="text-right">
            {row.unitsShare ? `${row.unitsShare} units` : '—'}
            {row.activeDays ? ` · ${row.activeDays} active days` : ''}
          </dd>
          <dt className="text-zinc-500">Split</dt>
          <dd className="text-right">{row.monthlyOccupantCount} monthly resident(s)</dd>
          {row.isEstimated ? (
            <>
              <dt className="text-amber-700">Bill type</dt>
              <dd className="text-right text-amber-700 font-medium">
                Estimated (pending meter update)
              </dd>
            </>
          ) : null}
          <dt className="text-zinc-500">Principal</dt>
          <dd className="text-right">{paiseToInr(invoiceRow.amountPaise)}</dd>
          <dt className="text-zinc-500">Due date</dt>
          <dd className="text-right">{formatDate(invoiceRow.dueDate)}</dd>
          {projection.accruedLateFeePaise > 0 ? (
            <>
              <dt className="text-rose-600">Late fee ({projection.daysOverdue}d overdue)</dt>
              <dd className="text-right font-medium text-rose-600">
                +{paiseToInr(projection.accruedLateFeePaise)}
              </dd>
            </>
          ) : null}
          <dt className="text-base font-semibold text-zinc-900">
            {invoiceRow.status === 'paid' ? 'Paid' : 'Your total'}
          </dt>
          <dd className="text-right text-base font-semibold text-zinc-900">
            {paiseToInr(
              invoiceRow.status === 'paid'
                ? invoiceRow.paidPaise
                : outstanding,
            )}
          </dd>
        </dl>
        {projection.effectiveStatus === 'overdue' ? (
          <p className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            Penalty accruing at 1% per day on the principal. Pay now to stop the clock.
          </p>
        ) : invoiceRow.status === 'pending' ? (
          <p className="text-xs text-zinc-500">
            Pay by {formatDate(invoiceRow.dueDate)} to avoid a 1%/day late fee.
          </p>
        ) : null}
      </section>

      {invoiceRow.status === 'paid' ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
          This invoice is already paid. Paid on {formatDate(invoiceRow.paidAt)}.
        </p>
      ) : invoiceRow.status === 'cancelled' ? (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700 ring-1 ring-inset ring-zinc-200">
          This invoice has been cancelled.
        </p>
      ) : (
        <div className="space-y-4">
          {cloudinary ? (
            <ElectricityPaymentProofForm
              invoiceId={invoiceRow.id}
              amountLabel={paiseToInr(outstanding)}
              uploadScreenshot={uploadPaymentScreenshotAction}
              existingProofUrl={row.paymentProofUrl}
              qrImageUrl={elecCategory?.qrCodeImageUrl ?? DEFAULT_ELECTRICITY_DAILY_QR_PATH}
              upiId={elecCategory?.upiId ?? DEFAULT_ELECTRICITY_DAILY_UPI_ID}
            />
          ) : isRazorpayConfigured() ? null : (
            <PaymentUnavailable />
          )}
        </div>
      )}
    </div>
  );
}
