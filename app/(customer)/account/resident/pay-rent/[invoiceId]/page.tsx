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
import { ResidentPayRentWithPromo } from '@/src/components/customer/account/resident/ResidentPayRentWithPromo';
import {
  InvoiceBreakdownRow,
} from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import { StatusChip } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { residentTabHref } from '@/src/lib/accountNavigation';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import { RentInvoiceBreakdownPanel } from '@/src/components/billing/RentInvoiceBreakdownPanel';
import { loadRentInvoiceBreakdown } from '@/src/lib/billing/rentInvoiceBreakdown';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { projectInvoice } from '@/src/services/rentInvoices';
import {
  ensureDefaultPaymentCategoriesForPg,
  getRentDepositBookingCategory,
} from '@/src/services/pgPaymentDefaults';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { getActiveRejectionForEntity } from '@/src/services/paymentProofRejectionService';
import { PaymentFlowErrorBoundary } from '@/src/components/customer/payments/PaymentFlowErrorBoundary';

export const dynamic = 'force-dynamic';

type RouteParams = { invoiceId: string };

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-800 ring-rose-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
};

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
      pgName: pgs.name,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      billingMonth: rentInvoices.billingMonth,
      dueDate: rentInvoices.dueDate,
      rentPaise: rentInvoices.rentPaise,
      discountPaise: rentInvoices.discountPaise,
      promoCode: rentInvoices.promoCode,
      status: rentInvoices.status,
      paidAt: rentInvoices.paidAt,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      notes: rentInvoices.notes,
      pgId: rentInvoices.pgId,
      cancelledAt: rentInvoices.cancelledAt,
      cancellationReason: rentInvoices.cancellationReason,
      customerPhone: customers.phone,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
      lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
      paymentId: rentInvoices.paymentId,
      isAdhoc: rentInvoices.isAdhoc,
      bedId: rentInvoices.bedId,
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
  const rentBreakdown = await loadRentInvoiceBreakdown(invoiceId);
  const amountLabel = paiseToInr(projected.outstandingPaise);
  const periodLabel = formatDate(row.billingMonth);
  const backHref = residentTabHref('payments');

  await ensureDefaultPaymentCategoriesForPg(row.pgId);
  const rentCategory = await getRentDepositBookingCategory(row.pgId);
  const activeRejection = await getActiveRejectionForEntity('rent_invoice', invoiceId);

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <header>
        <Link href={backHref} className={ACCOUNT_BACK_LINK}>
          ← Back to payments
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Rent invoice</h1>
        <p className={`font-mono ${ACCOUNT_PAGE_SUBTITLE}`}>{row.invoiceNumber}</p>
      </header>

      <ApgCard tier="account" className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Step 1 — Review</h2>
          <StatusChip status={projected.effectiveStatus} toneMap={STATUS_TONE} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <InvoiceBreakdownRow label="Period" value={periodLabel} />
          <InvoiceBreakdownRow label="Due date" value={formatDate(row.dueDate)} />
          <InvoiceBreakdownRow label="Room / bed" value={`R${row.roomNumber} · ${row.bedCode}`} />
          <InvoiceBreakdownRow label="Rent" value={paiseToInr(row.rentPaise)} />
          {(row.discountPaise ?? 0) > 0 ? (
            <>
              <InvoiceBreakdownRow
                label={row.promoCode ? `Discount (${row.promoCode})` : 'Discount'}
                value={`−${paiseToInr(row.discountPaise ?? 0)}`}
                tone="success"
              />
              <InvoiceBreakdownRow
                label="Rent after discount"
                value={paiseToInr(row.rentPaise - (row.discountPaise ?? 0))}
              />
            </>
          ) : null}
          <InvoiceBreakdownRow
            label="Late fee"
            value={paiseToInr(projected.accruedLateFeePaise)}
            tone={projected.accruedLateFeePaise > 0 ? 'danger' : undefined}
          />
          <InvoiceBreakdownRow label="Total to pay" value={amountLabel} emphasis />
        </dl>
        {row.notes ? (
          <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{row.notes}</p>
        ) : null}
      </ApgCard>

      {rentBreakdown ? (
        <RentInvoiceBreakdownPanel breakdown={rentBreakdown} theme="light" />
      ) : null}

      {row.status === 'paid' ? (
        <ApgCard tier="account" className="p-5 text-sm text-emerald-800">
          This invoice is already paid on {formatDate(row.paidAt)}.
        </ApgCard>
      ) : row.status === 'cancelled' ? (
        <ApgCard tier="account" className="p-5 text-sm text-zinc-700">
          This invoice was cancelled — no payment needed.
        </ApgCard>
      ) : (
        <PaymentFlowErrorBoundary
          page="resident-pay-rent"
          invoiceId={row.id}
          bookingId={row.bookingId}
          residentId={session.customerId}
        >
          <ResidentPayRentWithPromo
            invoiceId={row.id}
            customerId={session.customerId}
            rentPaise={row.rentPaise}
            initialDiscountPaise={row.discountPaise ?? 0}
            initialPromoCode={row.promoCode}
            initialOutstandingPaise={projected.outstandingPaise - projected.accruedLateFeePaise}
            lateFeePaise={projected.accruedLateFeePaise}
            periodLabel={periodLabel}
            confirmMessageBase={`You are paying ${amountLabel} for rent for ${periodLabel}.`}
            qrImageUrl={rentCategory?.qrCodeImageUrl ?? DEFAULT_RENT_DEPOSIT_QR_PATH}
            upiId={rentCategory?.upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID}
            existingProofUrl={row.paymentProofUrl}
            rejectionReason={activeRejection?.reasonLabel ?? null}
            rejectionMessage={activeRejection?.residentMessage ?? null}
            uploadScreenshot={uploadPaymentScreenshotAction}
            backHref={backHref}
          />
        </PaymentFlowErrorBoundary>
      )}
    </div>
  );
}
