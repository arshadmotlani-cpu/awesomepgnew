/**
 * Trace resident file uploads end-to-end — especially orphan uploads that never
 * reach an admin queue because the follow-up form submit never ran.
 */

import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  kycSubmissions,
  paymentLinks,
  pgPaymentRecords,
  pgs,
  playstationMemberships,
  rentInvoices,
  residentRequests,
  residentUploadEvents,
  rooms,
  stayExtensions,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { logger } from '@/src/lib/logger';

export type ResidentUploadType =
  | 'kyc'
  | 'meter_photo'
  | 'refund_qr'
  | 'payment_proof'
  | 'booking_payment'
  | 'electricity_payment'
  | 'extension_payment'
  | 'deposit_link'
  | 'ps4_payment';

export type ResidentUploadTraceInput = {
  customerId: string;
  uploadType: ResidentUploadType;
  bookingId?: string | null;
  pgId?: string | null;
};

export type ResidentUploadLinkInput = {
  storagePath: string;
  adminQueue: string;
  linkedEntity: string;
  linkedEntityId: string;
  bookingId?: string | null;
  pgId?: string | null;
};

export type ResidentUploadAuditRow = {
  id: string;
  residentId: string;
  residentName: string;
  uploadType: string;
  uploadTypeLabel: string;
  uploadedAt: Date;
  status: string;
  adminVisible: boolean;
  adminQueue: string | null;
  storagePath: string;
  bookingId: string | null;
  pgId: string | null;
  pgName: string | null;
  adminHref: string | null;
  source: 'trace' | 'aggregate';
};

const UPLOAD_TYPE_LABELS: Record<string, string> = {
  kyc: 'KYC documents',
  meter_photo: 'Deposit refund meter photo',
  refund_qr: 'Refund UPI / QR',
  payment_proof: 'Payment receipt / screenshot',
  booking_payment: 'Booking payment proof',
  electricity_payment: 'Electricity payment proof',
  extension_payment: 'Extension payment proof',
  deposit_link: 'Additional deposit proof',
  ps4_payment: 'PS4 membership proof',
};

export function residentUploadTypeLabel(type: string): string {
  return UPLOAD_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

/** Record a successful blob/filesystem write — admin_visible=false until linked. */
export async function recordResidentUpload(
  input: ResidentUploadTraceInput & { storagePath: string },
): Promise<string> {
  const [row] = await db
    .insert(residentUploadEvents)
    .values({
      customerId: input.customerId,
      bookingId: input.bookingId ?? null,
      pgId: input.pgId ?? null,
      uploadType: input.uploadType,
      storagePath: input.storagePath.trim(),
      status: 'uploaded',
      adminVisible: false,
      adminQueue: null,
    })
    .returning({ id: residentUploadEvents.id });

  logger.info('resident upload recorded', {
    uploadId: row.id,
    residentId: input.customerId,
    bookingId: input.bookingId ?? null,
    pgId: input.pgId ?? null,
    uploadType: input.uploadType,
    storagePath: input.storagePath,
    adminQueueStatus: 'orphan',
  });

  return row.id;
}

/** Mark upload as linked to a domain record and visible in admin queues. */
export async function linkResidentUpload(input: ResidentUploadLinkInput): Promise<void> {
  const path = input.storagePath.trim();
  if (!path) return;

  const updated = await db
    .update(residentUploadEvents)
    .set({
      status: 'linked',
      adminVisible: true,
      adminQueue: input.adminQueue,
      linkedEntity: input.linkedEntity,
      linkedEntityId: input.linkedEntityId,
      bookingId: input.bookingId ?? undefined,
      pgId: input.pgId ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(residentUploadEvents.storagePath, path))
    .returning({ id: residentUploadEvents.id });

  if (updated.length > 0) {
    logger.info('resident upload linked', {
      uploadId: updated[0]!.id,
      storagePath: path,
      adminQueue: input.adminQueue,
      linkedEntity: input.linkedEntity,
      linkedEntityId: input.linkedEntityId,
      adminQueueStatus: 'visible',
    });
    return;
  }

  logger.warn('resident upload link — no trace row for path', {
    storagePath: path,
    adminQueue: input.adminQueue,
    linkedEntity: input.linkedEntity,
    linkedEntityId: input.linkedEntityId,
  });
}

/** KYC is atomic — record all three files as immediately admin-visible. */
export async function recordKycUploadsLinked(input: {
  customerId: string;
  bookingId: string | null;
  pgId: string | null;
  submissionId: string;
  paths: string[];
}): Promise<void> {
  if (input.paths.length === 0) return;
  const now = new Date();
  await db.insert(residentUploadEvents).values(
    input.paths.map((storagePath) => ({
      customerId: input.customerId,
      bookingId: input.bookingId,
      pgId: input.pgId,
      uploadType: 'kyc' as const,
      storagePath,
      status: 'linked',
      adminVisible: true,
      adminQueue: 'kyc',
      linkedEntity: 'kyc_submission',
      linkedEntityId: input.submissionId,
      createdAt: now,
      updatedAt: now,
    })),
  );

  logger.info('KYC uploads linked', {
    submissionId: input.submissionId,
    residentId: input.customerId,
    uploadCount: input.paths.length,
    adminQueueStatus: 'visible',
  });
}

function adminHrefForQueue(
  adminQueue: string | null,
  linkedEntityId: string | null,
  bookingId: string | null,
  pgId: string | null,
): string | null {
  if (!linkedEntityId && !bookingId) return null;
  switch (adminQueue) {
    case 'kyc':
      return linkedEntityId ? `/admin/residents/kyc/${linkedEntityId}` : null;
    case 'operations':
      return '/admin/operations?filter=waiting_for_approval';
    case 'collections':
      return pgId ? `/admin/collections/pg/${pgId}` : '/admin/collections';
    case 'checkout_settlements':
      return linkedEntityId ? `/admin/checkout-settlements/${linkedEntityId}` : '/admin/checkout-settlements';
    case 'requests':
      return '/admin/requests';
    case 'extensions':
      return '/admin/extensions';
    case 'playstation':
      return '/admin/playstation';
    default:
      return bookingId ? `/admin/bookings/${bookingId}` : null;
  }
}

const AGGREGATE_LOOKBACK_DAYS = 30;

/** Unified audit feed — trace table + domain tables for historical coverage. */
export async function listRecentResidentUploadsForAdmin(
  session: AdminSession,
  limit = 200,
): Promise<ResidentUploadAuditRow[]> {
  const since = new Date(Date.now() - AGGREGATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const traced = await db
    .select({
      id: residentUploadEvents.id,
      residentId: residentUploadEvents.customerId,
      residentName: customers.fullName,
      uploadType: residentUploadEvents.uploadType,
      uploadedAt: residentUploadEvents.createdAt,
      status: residentUploadEvents.status,
      adminVisible: residentUploadEvents.adminVisible,
      adminQueue: residentUploadEvents.adminQueue,
      storagePath: residentUploadEvents.storagePath,
      bookingId: residentUploadEvents.bookingId,
      pgId: residentUploadEvents.pgId,
      pgName: pgs.name,
      linkedEntityId: residentUploadEvents.linkedEntityId,
    })
    .from(residentUploadEvents)
    .innerJoin(customers, eq(customers.id, residentUploadEvents.customerId))
    .leftJoin(pgs, eq(pgs.id, residentUploadEvents.pgId))
    .where(gte(residentUploadEvents.createdAt, since))
    .orderBy(desc(residentUploadEvents.createdAt))
    .limit(limit);

  const tracedPaths = new Set(traced.map((r) => r.storagePath));
  const rows: ResidentUploadAuditRow[] = [];

  for (const row of traced) {
    if (row.pgId && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
      continue;
    }
    rows.push({
      id: row.id,
      residentId: row.residentId,
      residentName: row.residentName,
      uploadType: row.uploadType,
      uploadTypeLabel: residentUploadTypeLabel(row.uploadType),
      uploadedAt: row.uploadedAt,
      status: row.status,
      adminVisible: row.adminVisible,
      adminQueue: row.adminQueue,
      storagePath: row.storagePath,
      bookingId: row.bookingId,
      pgId: row.pgId,
      pgName: row.pgName,
      adminHref: adminHrefForQueue(row.adminQueue, row.linkedEntityId, row.bookingId, row.pgId),
      source: 'trace',
    });
  }

  const aggregate = await aggregateDomainUploads(since);
  for (const item of aggregate) {
    if (item.storagePath && tracedPaths.has(item.storagePath)) continue;
    if (item.pgId && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, item.pgId)) {
      continue;
    }
    rows.push(item);
  }

  rows.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  return rows.slice(0, limit);
}

async function aggregateDomainUploads(since: Date): Promise<ResidentUploadAuditRow[]> {
  const out: ResidentUploadAuditRow[] = [];

  const kycRows = await db
    .select({
      id: kycSubmissions.id,
      customerId: kycSubmissions.customerId,
      customerName: customers.fullName,
      createdAt: kycSubmissions.createdAt,
      status: kycSubmissions.status,
      front: kycSubmissions.aadhaarFrontPath,
      back: kycSubmissions.aadhaarBackPath,
      bookingId: kycSubmissions.bookingId,
    })
    .from(kycSubmissions)
    .innerJoin(customers, eq(customers.id, kycSubmissions.customerId))
    .where(gte(kycSubmissions.createdAt, since))
    .orderBy(desc(kycSubmissions.createdAt))
    .limit(80);

  for (const k of kycRows) {
    for (const path of [k.front, k.back].filter(Boolean)) {
      out.push({
        id: `kyc-${k.id}-${path}`,
        residentId: k.customerId,
        residentName: k.customerName,
        uploadType: 'kyc',
        uploadTypeLabel: residentUploadTypeLabel('kyc'),
        uploadedAt: k.createdAt,
        status: k.status,
        adminVisible: true,
        adminQueue: 'kyc',
        storagePath: path,
        bookingId: k.bookingId,
        pgId: null,
        pgName: null,
        adminHref: `/admin/residents/kyc/${k.id}`,
        source: 'aggregate',
      });
    }
  }

  const rentProofs = await db
    .select({
      id: rentInvoices.id,
      customerId: rentInvoices.customerId,
      customerName: customers.fullName,
      pgId: rentInvoices.pgId,
      pgName: pgs.name,
      bookingId: rentInvoices.bookingId,
      updatedAt: rentInvoices.updatedAt,
      status: rentInvoices.status,
      url: rentInvoices.paymentProofUrl,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .where(
      and(
        gte(rentInvoices.updatedAt, since),
        sql`${rentInvoices.paymentProofUrl} IS NOT NULL`,
      ),
    )
    .limit(80);

  for (const r of rentProofs) {
    if (!r.url) continue;
    out.push({
      id: `rent-${r.id}`,
      residentId: r.customerId,
      residentName: r.customerName,
      uploadType: 'payment_proof',
      uploadTypeLabel: residentUploadTypeLabel('payment_proof'),
      uploadedAt: r.updatedAt,
      status: r.status,
      adminVisible: true,
      adminQueue: 'collections',
      storagePath: r.url,
      bookingId: r.bookingId,
      pgId: r.pgId,
      pgName: r.pgName,
      adminHref: `/admin/collections/pg/${r.pgId}`,
      source: 'aggregate',
    });
  }

  const elecProofs = await db
    .select({
      id: electricityInvoices.id,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      pgId: electricityBills.pgId,
      pgName: pgs.name,
      bookingId: electricityInvoices.bookingId,
      updatedAt: electricityInvoices.updatedAt,
      status: electricityInvoices.status,
      url: electricityInvoices.paymentProofUrl,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
    .where(
      and(
        gte(electricityInvoices.updatedAt, since),
        sql`${electricityInvoices.paymentProofUrl} IS NOT NULL`,
      ),
    )
    .limit(80);

  for (const e of elecProofs) {
    if (!e.url) continue;
    out.push({
      id: `elec-${e.id}`,
      residentId: e.customerId,
      residentName: e.customerName,
      uploadType: 'electricity_payment',
      uploadTypeLabel: residentUploadTypeLabel('electricity_payment'),
      uploadedAt: e.updatedAt,
      status: e.status,
      adminVisible: true,
      adminQueue: 'collections',
      storagePath: e.url,
      bookingId: e.bookingId,
      pgId: e.pgId,
      pgName: e.pgName,
      adminHref: `/admin/collections/pg/${e.pgId}`,
      source: 'aggregate',
    });
  }

  const refundReqs = await db
    .select({
      id: residentRequests.id,
      customerId: residentRequests.customerId,
      customerName: customers.fullName,
      pgId: residentRequests.pgId,
      pgName: pgs.name,
      bookingId: residentRequests.bookingId,
      createdAt: residentRequests.createdAt,
      status: residentRequests.status,
      meterUrl: residentRequests.meterReadingPhotoUrl,
      qrUrl: residentRequests.payoutQrUrl,
    })
    .from(residentRequests)
    .innerJoin(customers, eq(customers.id, residentRequests.customerId))
    .innerJoin(pgs, eq(pgs.id, residentRequests.pgId))
    .where(
      and(
        eq(residentRequests.type, 'deposit_refund'),
        gte(residentRequests.createdAt, since),
        or(
          sql`${residentRequests.meterReadingPhotoUrl} IS NOT NULL`,
          sql`${residentRequests.payoutQrUrl} IS NOT NULL`,
        ),
      ),
    )
    .limit(80);

  for (const r of refundReqs) {
    if (r.meterUrl) {
      out.push({
        id: `refund-meter-${r.id}`,
        residentId: r.customerId,
        residentName: r.customerName,
        uploadType: 'meter_photo',
        uploadTypeLabel: residentUploadTypeLabel('meter_photo'),
        uploadedAt: r.createdAt,
        status: r.status,
        adminVisible: true,
        adminQueue: 'requests',
        storagePath: r.meterUrl,
        bookingId: r.bookingId,
        pgId: r.pgId,
        pgName: r.pgName,
        adminHref: '/admin/requests',
        source: 'aggregate',
      });
    }
    if (r.qrUrl) {
      out.push({
        id: `refund-qr-${r.id}`,
        residentId: r.customerId,
        residentName: r.customerName,
        uploadType: 'refund_qr',
        uploadTypeLabel: residentUploadTypeLabel('refund_qr'),
        uploadedAt: r.createdAt,
        status: r.status,
        adminVisible: true,
        adminQueue: 'requests',
        storagePath: r.qrUrl,
        bookingId: r.bookingId,
        pgId: r.pgId,
        pgName: r.pgName,
        adminHref: '/admin/requests',
        source: 'aggregate',
      });
    }
  }

  const settlements = await db
    .select({
      id: checkoutSettlements.id,
      customerId: checkoutSettlements.customerId,
      customerName: customers.fullName,
      pgId: pgs.id,
      pgName: pgs.name,
      bookingId: checkoutSettlements.bookingId,
      updatedAt: checkoutSettlements.updatedAt,
      status: checkoutSettlements.status,
      meterUrl: checkoutSettlements.electricityMeterPhotoUrl,
      qrUrl: checkoutSettlements.payoutQrUrl,
    })
    .from(checkoutSettlements)
    .innerJoin(customers, eq(customers.id, checkoutSettlements.customerId))
    .innerJoin(bookings, eq(bookings.id, checkoutSettlements.bookingId))
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        gte(checkoutSettlements.updatedAt, since),
        or(
          sql`${checkoutSettlements.electricityMeterPhotoUrl} IS NOT NULL`,
          sql`${checkoutSettlements.payoutQrUrl} IS NOT NULL`,
        ),
      ),
    )
    .limit(80);

  for (const s of settlements) {
    if (s.meterUrl) {
      out.push({
        id: `checkout-meter-${s.id}`,
        residentId: s.customerId,
        residentName: s.customerName,
        uploadType: 'meter_photo',
        uploadTypeLabel: residentUploadTypeLabel('meter_photo'),
        uploadedAt: s.updatedAt,
        status: s.status,
        adminVisible: true,
        adminQueue: 'checkout_settlements',
        storagePath: s.meterUrl,
        bookingId: s.bookingId,
        pgId: s.pgId,
        pgName: s.pgName,
        adminHref: `/admin/checkout-settlements/${s.id}`,
        source: 'aggregate',
      });
    }
    if (s.qrUrl) {
      out.push({
        id: `checkout-qr-${s.id}`,
        residentId: s.customerId,
        residentName: s.customerName,
        uploadType: 'refund_qr',
        uploadTypeLabel: residentUploadTypeLabel('refund_qr'),
        uploadedAt: s.updatedAt,
        status: s.status,
        adminVisible: true,
        adminQueue: 'checkout_settlements',
        storagePath: s.qrUrl,
        bookingId: s.bookingId,
        pgId: s.pgId,
        pgName: s.pgName,
        adminHref: `/admin/checkout-settlements/${s.id}`,
        source: 'aggregate',
      });
    }
  }

  const bookingPayments = await db
    .select({
      id: pgPaymentRecords.id,
      customerId: pgPaymentRecords.customerId,
      customerName: customers.fullName,
      pgId: pgPaymentRecords.pgId,
      pgName: pgs.name,
      bookingId: pgPaymentRecords.bookingId,
      createdAt: pgPaymentRecords.createdAt,
      status: pgPaymentRecords.status,
      url: pgPaymentRecords.paymentScreenshotUrl,
    })
    .from(pgPaymentRecords)
    .innerJoin(customers, eq(customers.id, pgPaymentRecords.customerId))
    .innerJoin(pgs, eq(pgs.id, pgPaymentRecords.pgId))
    .where(
      and(
        gte(pgPaymentRecords.createdAt, since),
        sql`${pgPaymentRecords.paymentScreenshotUrl} IS NOT NULL`,
      ),
    )
    .limit(80);

  for (const b of bookingPayments) {
    if (!b.url) continue;
    out.push({
      id: `booking-pay-${b.id}`,
      residentId: b.customerId,
      residentName: b.customerName,
      uploadType: b.bookingId ? 'booking_payment' : 'payment_proof',
      uploadTypeLabel: residentUploadTypeLabel(
        b.bookingId ? 'booking_payment' : 'payment_proof',
      ),
      uploadedAt: b.createdAt,
      status: b.status,
      adminVisible: true,
      adminQueue: 'collections',
      storagePath: b.url,
      bookingId: b.bookingId,
      pgId: b.pgId,
      pgName: b.pgName,
      adminHref: `/admin/collections/pg/${b.pgId}`,
      source: 'aggregate',
    });
  }

  const extProofs = await db
    .select({
      id: stayExtensions.id,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      bookingId: stayExtensions.bookingId,
      updatedAt: stayExtensions.updatedAt,
      status: stayExtensions.status,
      url: stayExtensions.paymentProofUrl,
    })
    .from(stayExtensions)
    .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(
      and(
        gte(stayExtensions.updatedAt, since),
        sql`${stayExtensions.paymentProofUrl} IS NOT NULL`,
      ),
    )
    .limit(40);

  for (const x of extProofs) {
    if (!x.url) continue;
    out.push({
      id: `ext-${x.id}`,
      residentId: x.customerId,
      residentName: x.customerName,
      uploadType: 'extension_payment',
      uploadTypeLabel: residentUploadTypeLabel('extension_payment'),
      uploadedAt: x.updatedAt,
      status: x.status,
      adminVisible: true,
      adminQueue: 'extensions',
      storagePath: x.url,
      bookingId: x.bookingId,
      pgId: null,
      pgName: null,
      adminHref: '/admin/extensions',
      source: 'aggregate',
    });
  }

  const depositLinks = await db
    .select({
      id: paymentLinks.id,
      customerId: paymentLinks.residentId,
      customerName: customers.fullName,
      pgId: paymentLinks.pgId,
      pgName: pgs.name,
      bookingId: paymentLinks.bookingId,
      updatedAt: paymentLinks.createdAt,
      status: paymentLinks.status,
      url: paymentLinks.paymentProofUrl,
    })
    .from(paymentLinks)
    .innerJoin(customers, eq(customers.id, paymentLinks.residentId))
    .innerJoin(pgs, eq(pgs.id, paymentLinks.pgId))
    .where(
      and(
        gte(paymentLinks.createdAt, since),
        sql`${paymentLinks.paymentProofUrl} IS NOT NULL`,
      ),
    )
    .limit(40);

  for (const d of depositLinks) {
    if (!d.url) continue;
    out.push({
      id: `deposit-link-${d.id}`,
      residentId: d.customerId,
      residentName: d.customerName,
      uploadType: 'deposit_link',
      uploadTypeLabel: residentUploadTypeLabel('deposit_link'),
      uploadedAt: d.updatedAt,
      status: d.status,
      adminVisible: true,
      adminQueue: 'collections',
      storagePath: d.url,
      bookingId: d.bookingId,
      pgId: d.pgId,
      pgName: d.pgName,
      adminHref: `/admin/collections/pg/${d.pgId}`,
      source: 'aggregate',
    });
  }

  const ps4 = await db
    .select({
      id: playstationMemberships.id,
      customerId: playstationMemberships.customerId,
      customerName: customers.fullName,
      pgId: playstationMemberships.pgId,
      pgName: pgs.name,
      updatedAt: playstationMemberships.updatedAt,
      status: playstationMemberships.status,
      url: playstationMemberships.paymentProofUrl,
    })
    .from(playstationMemberships)
    .innerJoin(customers, eq(customers.id, playstationMemberships.customerId))
    .innerJoin(pgs, eq(pgs.id, playstationMemberships.pgId))
    .where(
      and(
        gte(playstationMemberships.updatedAt, since),
        sql`${playstationMemberships.paymentProofUrl} IS NOT NULL`,
      ),
    )
    .limit(40);

  for (const p of ps4) {
    if (!p.url) continue;
    out.push({
      id: `ps4-${p.id}`,
      residentId: p.customerId,
      residentName: p.customerName,
      uploadType: 'ps4_payment',
      uploadTypeLabel: residentUploadTypeLabel('ps4_payment'),
      uploadedAt: p.updatedAt,
      status: p.status,
      adminVisible: true,
      adminQueue: 'playstation',
      storagePath: p.url,
      bookingId: null,
      pgId: p.pgId,
      pgName: p.pgName,
      adminHref: '/admin/playstation',
      source: 'aggregate',
    });
  }

  return out;
}

export async function countOrphanUploadsForAdmin(session: AdminSession): Promise<number> {
  const since = new Date(Date.now() - AGGREGATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      pgId: residentUploadEvents.pgId,
      adminVisible: residentUploadEvents.adminVisible,
    })
    .from(residentUploadEvents)
    .where(
      and(
        eq(residentUploadEvents.adminVisible, false),
        gte(residentUploadEvents.createdAt, since),
      ),
    );

  return rows.filter(
    (r) => !r.pgId || adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, r.pgId),
  ).length;
}
