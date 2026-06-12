import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  bookings,
  customers,
  pgs,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import {
  DEFAULT_RENT_DEPOSIT_QR_PATH,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import { RentPaymentProofForm } from '@/src/components/customer/RentPaymentProofForm';
import { ACCOUNT_RESIDENT_HREF } from '@/src/lib/accountNavigation';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_LABEL,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
  ACCOUNT_SURFACE_PADDED,
  ACCOUNT_VALUE,
} from '@/src/components/customer/accountStyles';
import { ensureDefaultPaymentCategoriesForPg, getRentDepositBookingCategory } from '@/src/services/pgPaymentDefaults';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { projectInvoice } from '@/src/services/rentInvoices';
import { requireCustomerSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

type RouteParams = { invoiceId: string };

export default async function PayRentPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { invoiceId } = await params;
  const session = await requireCustomerSession(`/account/resident/pay-rent/${invoiceId}`);

  const [row] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      bookingId: rentInvoices.bookingId,
      bookingCode: bookings.bookingCode,
      customerId: rentInvoices.customerId,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
      pgName: pgs.name,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      billingMonth: rentInvoices.billingMonth,
      dueDate: rentInvoices.dueDate,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
      lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
      status: rentInvoices.status,
      paidAt: rentInvoices.paidAt,
      paymentId: rentInvoices.paymentId,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      cancelledAt: rentInvoices.cancelledAt,
      cancellationReason: rentInvoices.cancellationReason,
      notes: rentInvoices.notes,
      bedId: rentInvoices.bedId,
      pgId: rentInvoices.pgId,
      createdAt: rentInvoices.createdAt,
      updatedAt: rentInvoices.updatedAt,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);

  if (!row || row.customerId !== session.customerId) notFound();

  const projected = projectInvoice(row);

  await ensureDefaultPaymentCategoriesForPg(row.pgId);
  const rentCategory = await getRentDepositBookingCategory(row.pgId);

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href={ACCOUNT_RESIDENT_HREF} className={ACCOUNT_BACK_LINK}>
          ← Back to resident area
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Pay rent</h1>
        <p className={`font-mono ${ACCOUNT_PAGE_SUBTITLE}`}>{row.invoiceNumber}</p>
      </header>

      <section className={`${ACCOUNT_SURFACE_PADDED} space-y-3`}>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className={ACCOUNT_LABEL}>Resident</dt>
          <dd className={`text-right ${ACCOUNT_VALUE}`}>{row.customerFullName}</dd>
          <dt className={ACCOUNT_LABEL}>Bed</dt>
          <dd className={`text-right ${ACCOUNT_VALUE}`}>
            {row.pgName} · Room {row.roomNumber} · Bed {row.bedCode}
          </dd>
          <dt className={ACCOUNT_LABEL}>Billing month</dt>
          <dd className={`text-right ${ACCOUNT_VALUE}`}>{formatDate(row.billingMonth)}</dd>
          <dt className={ACCOUNT_LABEL}>Due date</dt>
          <dd className={`text-right ${ACCOUNT_VALUE}`}>{formatDate(row.dueDate)}</dd>
          <dt className={ACCOUNT_LABEL}>Rent</dt>
          <dd className="text-right text-zinc-900">{paiseToInr(row.rentPaise)}</dd>
          <dt className={ACCOUNT_LABEL}>Late fee accrued</dt>
          <dd className="text-right text-zinc-900">{paiseToInr(projected.accruedLateFeePaise)}</dd>
          <dt className="text-base font-semibold text-zinc-900">Total due</dt>
          <dd className="text-right text-base font-semibold text-zinc-900">
            {paiseToInr(projected.outstandingPaise)}
          </dd>
        </dl>

        {row.notes ? (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            {row.notes}
          </p>
        ) : null}
      </section>

      {row.status === 'paid' ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
          This invoice is already paid. Paid on {formatDate(row.paidAt)}.
        </p>
      ) : row.status === 'cancelled' ? (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700 ring-1 ring-inset ring-zinc-200">
          This invoice has been cancelled — no payment required.
        </p>
      ) : (
        <RentPaymentProofForm
          invoiceId={row.id}
          amountLabel={paiseToInr(projected.outstandingPaise)}
          uploadScreenshot={uploadPaymentScreenshotAction}
          existingProofUrl={row.paymentProofUrl}
          qrImageUrl={rentCategory?.qrCodeImageUrl ?? DEFAULT_RENT_DEPOSIT_QR_PATH}
          upiId={rentCategory?.upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID}
        />
      )}
    </div>
  );
}
