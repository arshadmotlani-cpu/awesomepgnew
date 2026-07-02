/**
 * Server-side idempotency for Express Booking sales.
 * Prevents duplicate bookings when admins double-click Review & Create.
 */
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '@/src/db/client';
import { auditLog } from '@/src/db/schema';
import type { ExpressBookingSaleResult } from '@/src/services/expressBookingSale';

const ACTION = 'express_booking_sale';
const IN_PROGRESS_MS = 3 * 60 * 1000;

export type ExpressBookingIdempotencyPayload = {
  adminId: string;
  customerId?: string;
  phone: string;
  bedId: string;
  checkInDate: string;
  stayType: string;
  checkOutDate?: string | null;
  rentAmountPaise: number;
  depositRequiredPaise: number;
  paymentStatus?: string;
};

export function deriveExpressBookingIdempotencyKey(
  input: ExpressBookingIdempotencyPayload,
): string {
  const raw = [
    input.adminId,
    input.customerId ?? '',
    input.phone.trim(),
    input.bedId,
    input.checkInDate,
    input.stayType,
    input.checkOutDate ?? '',
    String(input.rentAmountPaise),
    String(input.depositRequiredPaise),
    input.paymentStatus ?? 'paid_in_full',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

type StoredResult = ExpressBookingSaleResult & { ok: true };

function parseStoredResult(diff: unknown): StoredResult | null {
  if (!diff || typeof diff !== 'object') return null;
  const row = diff as Record<string, unknown>;
  if (row.status !== 'completed' || !row.result || typeof row.result !== 'object') {
    return null;
  }
  const result = row.result as Record<string, unknown>;
  if (result.ok !== true || typeof result.bookingId !== 'string') return null;
  return result as StoredResult;
}

export async function beginExpressBookingIdempotency(
  idempotencyKey: string,
  adminId: string,
): Promise<
  | { kind: 'proceed' }
  | { kind: 'replay'; result: StoredResult }
  | { kind: 'in_progress' }
> {
  const [latest] = await db
    .select({
      id: auditLog.id,
      diff: auditLog.diff,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, ACTION),
        sql`${auditLog.diff}->>'idempotencyKey' = ${idempotencyKey}`,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  if (!latest) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: adminId,
      entity: 'express_booking',
      entityId: adminId,
      action: ACTION,
      diff: {
        idempotencyKey,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      },
    });
    return { kind: 'proceed' };
  }

  const diff = latest.diff as Record<string, unknown> | null;
  const status = diff?.status;

  if (status === 'completed') {
    const stored = parseStoredResult(diff);
    if (stored) return { kind: 'replay', result: stored };
  }

  if (
    status === 'in_progress' &&
    latest.createdAt.getTime() > Date.now() - IN_PROGRESS_MS
  ) {
    return { kind: 'in_progress' };
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: adminId,
    entity: 'express_booking',
    entityId: adminId,
    action: ACTION,
    diff: {
      idempotencyKey,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      supersededRowId: latest.id,
    },
  });
  return { kind: 'proceed' };
}

export async function completeExpressBookingIdempotency(
  idempotencyKey: string,
  adminId: string,
  result: StoredResult,
): Promise<void> {
  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: adminId,
    entity: 'express_booking',
    entityId: adminId,
    action: ACTION,
    diff: {
      idempotencyKey,
      status: 'completed',
      completedAt: new Date().toISOString(),
      result,
    },
  });
}

export async function failExpressBookingIdempotency(
  idempotencyKey: string,
  adminId: string,
  error: string,
): Promise<void> {
  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: adminId,
    entity: 'express_booking',
    entityId: adminId,
    action: ACTION,
    diff: {
      idempotencyKey,
      status: 'failed',
      failedAt: new Date().toISOString(),
      error,
    },
  });
}

/** Drop stale in-progress locks (admin closed tab mid-flight). */
export async function isExpressBookingIdempotencyStale(
  idempotencyKey: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - IN_PROGRESS_MS);
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, ACTION),
        sql`${auditLog.diff}->>'idempotencyKey' = ${idempotencyKey}`,
        sql`${auditLog.diff}->>'status' = 'in_progress'`,
        gt(auditLog.createdAt, cutoff),
      ),
    )
    .limit(1);
  return !row;
}
