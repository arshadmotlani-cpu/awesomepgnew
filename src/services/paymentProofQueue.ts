import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { listPendingExtensionProofsForPg } from '@/src/services/extension';
import { listPendingElectricityProofsForPg } from '@/src/services/meterElectricity';
import { listPendingRentProofsForPg } from '@/src/services/rentInvoices';
import { listPendingDepositLinkProofsForPg } from '@/src/services/residentCharges';
import { listOwnerPayments, getQrBookingPaymentReview } from '@/src/services/qrPayments';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';
import { isNull } from 'drizzle-orm';

export type PendingPaymentReviewItem = {
  key: string;
  kind: 'qr' | 'rent' | 'electricity' | 'extension' | 'deposit_link';
  pgId: string;
  pgName: string;
  title: string;
  subtitle: string;
  amountPaise: number;
  screenshotUrl: string;
  entityId: string;
  bookingPaymentReview?: Awaited<ReturnType<typeof getQrBookingPaymentReview>>;
};

export async function listPendingPaymentReviews(
  session: AdminSession,
): Promise<PendingPaymentReviewItem[]> {
  const items: PendingPaymentReviewItem[] = [];

  const qrRows = await listOwnerPayments(session, { status: 'pending' });
  for (const p of qrRows) {
    const isBookingCheckout = Boolean(p.bookingCode);
    const bookingPaymentReview =
      isBookingCheckout && p.bookingId
        ? await getQrBookingPaymentReview(p.id)
        : null;
    items.push({
      key: `qr-${p.id}`,
      kind: 'qr',
      pgId: p.pgId,
      pgName: p.pgName,
      title: isBookingCheckout
        ? `${p.customerName} · Booking ${p.bookingCode}`
        : `${p.customerName} · ${p.categoryName}`,
      subtitle: isBookingCheckout
        ? bookingPaymentReview?.canPartialApprove
          ? 'Booking checkout — partial deposit eligible (rent + part deposit paid)'
          : 'PG booking checkout — rent, deposit & reservation'
        : p.month
          ? `Month ${p.month}`
          : 'QR payment',
      amountPaise: p.amountPaise,
      screenshotUrl: p.paymentScreenshotUrl,
      entityId: p.id,
      bookingPaymentReview: bookingPaymentReview ?? undefined,
    });
  }

  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(isNull(pgs.archivedAt));

  for (const pg of pgRows) {
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pg.id)) {
      continue;
    }

    const [rentProofs, elecProofs, extProofs] = await Promise.all([
      listPendingRentProofsForPg(pg.id),
      listPendingElectricityProofsForPg(pg.id),
      listPendingExtensionProofsForPg(pg.id),
    ]);

    for (const r of rentProofs) {
      if (!r.paymentProofUrl) continue;
      items.push({
        key: `rent-${r.invoiceId}`,
        kind: 'rent',
        pgId: pg.id,
        pgName: pg.name,
        title: `${r.customerName} · Rent ${r.invoiceNumber}`,
        subtitle: `Room ${r.roomNumber} · ${r.bedCode} · ${r.billingMonth.slice(0, 7)}`,
        amountPaise: r.rentPaise,
        screenshotUrl: r.paymentProofUrl,
        entityId: r.invoiceId,
      });
    }

    for (const e of elecProofs) {
      if (!e.paymentProofUrl) continue;
      items.push({
        key: `elec-${e.invoiceId}`,
        kind: 'electricity',
        pgId: pg.id,
        pgName: pg.name,
        title: `Electricity · ${e.invoiceNumber}`,
        subtitle: `Room ${e.roomNumber}`,
        amountPaise: e.amountPaise,
        screenshotUrl: e.paymentProofUrl,
        entityId: e.invoiceId,
      });
    }

    for (const x of extProofs) {
      if (!x.paymentProofUrl) continue;
      items.push({
        key: `ext-${x.extensionId}`,
        kind: 'extension',
        pgId: pg.id,
        pgName: pg.name,
        title: `${x.customerName} · Extension ${x.bookingCode}`,
        subtitle: 'Stay extension payment',
        amountPaise: x.amountPaise,
        screenshotUrl: x.paymentProofUrl,
        entityId: x.extensionId,
      });
    }

    const depositLinks = await listPendingDepositLinkProofsForPg(pg.id);
    for (const d of depositLinks) {
      if (!d.paymentProofUrl) continue;
      items.push({
        key: `deposit-link-${d.linkId}`,
        kind: 'deposit_link',
        pgId: pg.id,
        pgName: pg.name,
        title: `${d.customerName} · ${d.title ?? 'Additional deposit'}`,
        subtitle: 'Additional security deposit',
        amountPaise: d.amountPaise,
        screenshotUrl: d.paymentProofUrl,
        entityId: d.linkId,
      });
    }
  }

  return items;
}
