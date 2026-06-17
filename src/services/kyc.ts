import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, customers, kycSubmissions, type KycValidationReport } from '@/src/db/schema';
import {
  OCCUPANCY_PLACEHOLDER_EMAIL,
  OCCUPANCY_PLACEHOLDER_NAME,
  OCCUPANCY_PLACEHOLDER_PHONE,
} from '@/src/lib/occupancySqlFilters';
import {
  kycCustomerErrorMessage,
  KYC_STORAGE_UNAVAILABLE_MESSAGE,
  KYC_UPLOAD_FAILED_MESSAGE,
} from '@/src/lib/kyc/errors';
import { logger } from '@/src/lib/logger';
import {
  assertKycFileSize,
  assertKycMimeType,
  isKycUploadAvailable,
  storeKycFile,
} from '@/src/lib/kyc/storage';
import { stampProfileCompletedAtIfReady } from './profile';
import { trackAnalyticsEvent } from './visitorAnalytics';
import { validateKycImage, type KycImageKind } from './kycValidation';

export type KycUploadInput = {
  customerId: string;
  bookingId?: string | null;
  aadhaarFront: { buffer: Buffer; mime: string };
  aadhaarBack: { buffer: Buffer; mime: string };
  selfie: { buffer: Buffer; mime: string };
};

export async function submitKyc(input: KycUploadInput) {
  if (!isKycUploadAvailable()) {
    return { ok: false as const, message: KYC_STORAGE_UNAVAILABLE_MESSAGE };
  }

  const files: Array<{ kind: KycImageKind; buffer: Buffer; mime: string }> = [
    { kind: 'aadhaar_front', ...input.aadhaarFront },
    { kind: 'aadhaar_back', ...input.aadhaarBack },
    { kind: 'selfie', ...input.selfie },
  ];

  for (const f of files) {
    if (!assertKycMimeType(f.mime)) {
      return { ok: false as const, message: 'Only JPEG, PNG, or WebP images are allowed.' };
    }
    if (!assertKycFileSize(f.buffer.length)) {
      return { ok: false as const, message: 'Each image must be under 8 MB.' };
    }
  }

  const report: KycValidationReport = {};
  for (const f of files) {
    const v = await validateKycImage(f.buffer, f.kind);
    if (!v.ok) {
      return { ok: false as const, message: `${labelFor(f.kind)}: ${v.reason}` };
    }
    report[reportKeyFor(f.kind)] = v;
  }

  const submissionId = crypto.randomUUID();

  logger.info('KYC submit start', {
    customerId: input.customerId,
    submissionId,
    bookingId: input.bookingId ?? null,
    sizes: {
      aadhaarFront: input.aadhaarFront.buffer.length,
      aadhaarBack: input.aadhaarBack.buffer.length,
      selfie: input.selfie.buffer.length,
    },
  });

  try {
    // Upload to Blob / filesystem BEFORE inserting kyc_submissions (no FK on blobs).
    const [aadhaarFront, aadhaarBack, selfie] = await Promise.all([
      storeKycFile({
        customerId: input.customerId,
        submissionId,
        kind: 'aadhaar_front',
        buffer: input.aadhaarFront.buffer,
        mime: input.aadhaarFront.mime,
      }),
      storeKycFile({
        customerId: input.customerId,
        submissionId,
        kind: 'aadhaar_back',
        buffer: input.aadhaarBack.buffer,
        mime: input.aadhaarBack.mime,
      }),
      storeKycFile({
        customerId: input.customerId,
        submissionId,
        kind: 'selfie',
        buffer: input.selfie.buffer,
        mime: input.selfie.mime,
      }),
    ]);

    const now = new Date();
    const [row] = await db
      .insert(kycSubmissions)
      .values({
        id: submissionId,
        customerId: input.customerId,
        bookingId: input.bookingId ?? null,
        aadhaarFrontPath: aadhaarFront.storagePath,
        aadhaarFrontMime: aadhaarFront.mime,
        aadhaarBackPath: aadhaarBack.storagePath,
        aadhaarBackMime: aadhaarBack.mime,
        selfiePath: selfie.storagePath,
        selfieMime: selfie.mime,
        status: 'pending',
        validationReport: report,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db
      .update(customers)
      .set({ kycStatus: 'pending', updatedAt: now })
      .where(eq(customers.id, input.customerId));

    await stampProfileCompletedAtIfReady(input.customerId, now);

    void trackAnalyticsEvent({ eventType: 'kyc_submitted' });

    await db.insert(auditLog).values({
      actorType: 'customer',
      actorId: input.customerId,
      entity: 'kyc_submission',
      entityId: row.id,
      action: 'submit',
      diff: {
        bookingId: input.bookingId ?? null,
        validationReport: report,
        storage: {
          aadhaarFront: aadhaarFront.backend,
          aadhaarBack: aadhaarBack.backend,
          selfie: selfie.backend,
        },
      },
    });

    logger.info('KYC submit ok', {
      customerId: input.customerId,
      submissionId: row.id,
    });

    return { ok: true as const, submissionId: row.id };
  } catch (err) {
    logger.error('KYC submit failed', {
      customerId: input.customerId,
      submissionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false as const, message: kycCustomerErrorMessage(err) || KYC_UPLOAD_FAILED_MESSAGE };
  }
}

export async function reviewKycSubmission(args: {
  submissionId: string;
  adminId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}) {
  const [sub] = await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, args.submissionId))
    .limit(1);
  if (!sub) return { ok: false as const, message: 'KYC submission not found.' };
  if (sub.status !== 'pending') {
    return { ok: false as const, message: `Submission is already ${sub.status}.` };
  }

  const now = new Date();
  await db
    .update(kycSubmissions)
    .set({
      status: args.decision,
      rejectionReason: args.decision === 'rejected' ? args.reason ?? 'Rejected by admin' : null,
      reviewedByAdminId: args.adminId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(kycSubmissions.id, args.submissionId));

  await db
    .update(customers)
    .set({
      kycStatus: args.decision,
      updatedAt: now,
    })
    .where(eq(customers.id, sub.customerId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: args.adminId,
    entity: 'kyc_submission',
    entityId: sub.id,
    action: args.decision === 'approved' ? 'approve' : 'reject',
    diff: {
      customerId: sub.customerId,
      reason: args.reason ?? null,
      fromStatus: 'pending',
      toStatus: args.decision,
    },
  });

  return { ok: true as const };
}

export async function getLatestKycSubmission(customerId: string) {
  const [row] = await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.customerId, customerId))
    .orderBy(desc(kycSubmissions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getKycSubmission(id: string) {
  const [row] = await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, id))
    .limit(1);
  return row ?? null;
}

const kycSubmissionListSelect = {
  id: kycSubmissions.id,
  customerId: kycSubmissions.customerId,
  bookingId: kycSubmissions.bookingId,
  status: kycSubmissions.status,
  createdAt: kycSubmissions.createdAt,
  reviewedAt: kycSubmissions.reviewedAt,
  customerName: customers.fullName,
  customerPhone: customers.phone,
  customerEmail: customers.email,
};

export type KycSubmissionListRow = {
  id: string;
  customerId: string;
  bookingId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  reviewedAt: Date | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
};

export async function listPendingKycSubmissions(): Promise<KycSubmissionListRow[]> {
  return db
    .select(kycSubmissionListSelect)
    .from(kycSubmissions)
    .innerJoin(customers, eq(customers.id, kycSubmissions.customerId))
    .where(
      and(
        eq(kycSubmissions.status, 'pending'),
        ne(customers.phone, OCCUPANCY_PLACEHOLDER_PHONE),
        ne(customers.email, OCCUPANCY_PLACEHOLDER_EMAIL),
        ne(customers.fullName, OCCUPANCY_PLACEHOLDER_NAME),
      ),
    )
    .orderBy(desc(kycSubmissions.createdAt));
}

export async function listApprovedKycSubmissions(
  limit = 100,
): Promise<KycSubmissionListRow[]> {
  return db
    .select(kycSubmissionListSelect)
    .from(kycSubmissions)
    .innerJoin(customers, eq(customers.id, kycSubmissions.customerId))
    .where(eq(kycSubmissions.status, 'approved'))
    .orderBy(desc(kycSubmissions.reviewedAt), desc(kycSubmissions.createdAt))
    .limit(limit);
}

function reportKeyFor(kind: KycImageKind): keyof KycValidationReport {
  switch (kind) {
    case 'aadhaar_front':
      return 'aadhaarFront';
    case 'aadhaar_back':
      return 'aadhaarBack';
    case 'selfie':
      return 'selfie';
  }
}

function labelFor(kind: KycImageKind): string {
  switch (kind) {
    case 'aadhaar_front':
      return 'Aadhaar front';
    case 'aadhaar_back':
      return 'Aadhaar back';
    case 'selfie':
      return 'Selfie';
  }
}
