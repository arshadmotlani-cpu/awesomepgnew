import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { listPendingExtensionProofsForPg } from '@/src/services/extension';
import { listPendingElectricityProofsForPg } from '@/src/services/meterElectricity';
import { listPendingRentProofsForPg } from '@/src/services/rentInvoices';
import { listOwnerPayments } from '@/src/services/qrPayments';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';
import { isNull } from 'drizzle-orm';

export type PendingPaymentReviewItem = {
  key: string;
  kind: 'qr' | 'rent' | 'electricity' | 'extension';
  pgId: string;
  pgName: string;
  title: string;
  subtitle: string;
  amountPaise: number;
  screenshotUrl: string;
  entityId: string;
};

export async function listPendingPaymentReviews(
  session: AdminSession,
): Promise<PendingPaymentReviewItem[]> {
  const items: PendingPaymentReviewItem[] = [];

  const qrRows = await listOwnerPayments(session, { status: 'pending' });
  for (const p of qrRows) {
    items.push({
      key: `qr-${p.id}`,
      kind: 'qr',
      pgId: p.pgId,
      pgName: p.pgName,
      title: `${p.customerName} · ${p.categoryName}`,
      subtitle: p.month ? `Month ${p.month}` : 'QR payment',
      amountPaise: p.amountPaise,
      screenshotUrl: p.paymentScreenshotUrl,
      entityId: p.id,
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
  }

  return items;
}
