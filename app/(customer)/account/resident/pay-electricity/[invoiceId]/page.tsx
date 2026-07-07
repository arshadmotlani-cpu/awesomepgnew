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
import { ResidentPayElectricityClient } from '@/src/components/customer/account/resident/ResidentPayElectricityClient';
import { InvoiceBreakdownRow } from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import { StatusChip } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { residentTabHref } from '@/src/lib/accountNavigation';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { projectElectricityInvoice, getElectricityBreakdownForInvoice } from '@/src/services/electricityBilling';
import { ElectricityBillCalculationBreakdownPanel } from '@/src/components/billing/ElectricityBillCalculationBreakdownPanel';
import {
  ensureDefaultPaymentCategoriesForPg,
  getElectricityDailyCategory,
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
      prepaidCreditAppliedPaise: electricityBills.prepaidCreditAppliedPaise,
      monthlyOccupantCount: electricityBills.monthlyOccupantCount,
      isEstimated: electricityBills.isEstimated,
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
  const amountLabel = paiseToInr(outstanding);
  const periodLabel = formatDate(invoiceRow.billingMonth);
  const backHref = residentTabHref('payments');
  const calculation = await getElectricityBreakdownForInvoice(invoiceId);
  const activeRejection = await getActiveRejectionForEntity('electricity_invoice', invoiceId);

  await ensureDefaultPaymentCategoriesForPg(row.pgId);
  const elecCategory = await getElectricityDailyCategory(row.pgId);

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href={backHref} className={ACCOUNT_BACK_LINK}>
          ← Back to payments
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Electricity invoice</h1>
        <p className={`font-mono ${ACCOUNT_PAGE_SUBTITLE}`}>{invoiceRow.invoiceNumber}</p>
      </header>

      <ApgCard tier="account" className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Step 1 — Review</h2>
          <StatusChip status={projection.effectiveStatus} toneMap={STATUS_TONE} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <InvoiceBreakdownRow label="Period" value={periodLabel} />
          <InvoiceBreakdownRow label="Due date" value={formatDate(invoiceRow.dueDate)} />
          <InvoiceBreakdownRow label="Room / bed" value={`R${row.roomNumber} · ${row.bedCode}`} />
          <InvoiceBreakdownRow
            label="Your share (principal)"
            value={paiseToInr(invoiceRow.amountPaise)}
          />
          {projection.accruedLateFeePaise > 0 ? (
            <InvoiceBreakdownRow
              label={`Late fee (${projection.daysOverdue}d overdue)`}
              value={`+${paiseToInr(projection.accruedLateFeePaise)}`}
              tone="danger"
            />
          ) : null}
          <InvoiceBreakdownRow label="Total to pay" value={amountLabel} emphasis />
        </dl>
        {projection.effectiveStatus === 'overdue' ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Pay now to stop late fees from growing.
          </p>
        ) : null}
      </ApgCard>

      {calculation ? (
        <ElectricityBillCalculationBreakdownPanel
          breakdown={calculation.breakdown}
          viewer={calculation.viewer}
          theme="light"
        />
      ) : null}

      {invoiceRow.status === 'paid' ? (
        <ApgCard tier="account" className="p-5 text-sm text-emerald-800">
          This invoice is already paid on {formatDate(invoiceRow.paidAt)}.
        </ApgCard>
      ) : invoiceRow.status === 'cancelled' ? (
        <ApgCard tier="account" className="p-5 text-sm text-zinc-700">
          This invoice was cancelled.
        </ApgCard>
      ) : (
        <PaymentFlowErrorBoundary
          page="resident-pay-electricity"
          invoiceId={invoiceRow.id}
          bookingId={invoiceRow.bookingId}
          residentId={session.customerId}
        >
          <ResidentPayElectricityClient
            invoiceId={invoiceRow.id}
            amountLabel={amountLabel}
            confirmMessage={`You are paying ${amountLabel} for electricity for ${periodLabel}. Pay the exact amount via UPI, then upload your payment screenshot for verification.`}
            qrImageUrl={elecCategory?.qrCodeImageUrl ?? DEFAULT_ELECTRICITY_DAILY_QR_PATH}
            upiId={elecCategory?.upiId ?? DEFAULT_ELECTRICITY_DAILY_UPI_ID}
            existingProofUrl={row.paymentProofUrl}
            rejectionReason={activeRejection?.reasonLabel ?? null}
            rejectionMessage={activeRejection?.residentMessage ?? null}
            uploadScreenshot={uploadPaymentScreenshotAction}
            backHref={backHref}
            residentId={session.customerId}
          />
        </PaymentFlowErrorBoundary>
      )}
    </div>
  );
}
