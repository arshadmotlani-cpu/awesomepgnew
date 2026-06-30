/**
 * Tracks in-flight electricity bill generation so admins see real status
 * and cannot double-submit for the same room + billing month.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBillGenerationJobs } from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import type { DateLike } from '@/src/lib/dates';

export type ElectricityBillGenerationJobView = {
  id: string;
  requestId: string;
  roomId: string;
  billingMonth: string;
  status: 'running' | 'success' | 'failed' | 'duplicate';
  billId: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string') return causeCode;
  }
  return null;
}

function mapJob(row: typeof electricityBillGenerationJobs.$inferSelect): ElectricityBillGenerationJobView {
  return {
    id: row.id,
    requestId: row.requestId,
    roomId: row.roomId,
    billingMonth: String(row.billingMonth),
    status: row.status,
    billId: row.billId,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export async function getElectricityBillGenerationJob(
  jobId: string,
): Promise<ElectricityBillGenerationJobView | null> {
  const [row] = await db
    .select()
    .from(electricityBillGenerationJobs)
    .where(eq(electricityBillGenerationJobs.id, jobId))
    .limit(1);
  return row ? mapJob(row) : null;
}

export async function getActiveElectricityBillGenerationJob(input: {
  roomId: string;
  billingMonth: DateLike;
}): Promise<ElectricityBillGenerationJobView | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const [row] = await db
    .select()
    .from(electricityBillGenerationJobs)
    .where(
      and(
        eq(electricityBillGenerationJobs.roomId, input.roomId),
        eq(electricityBillGenerationJobs.billingMonth, billingMonth),
        eq(electricityBillGenerationJobs.status, 'running'),
      ),
    )
    .orderBy(desc(electricityBillGenerationJobs.startedAt))
    .limit(1);
  return row ? mapJob(row) : null;
}

export async function beginElectricityBillGenerationJob(input: {
  requestId: string;
  roomId: string;
  billingMonth: DateLike;
  adminId: string;
}): Promise<
  | { kind: 'started'; job: ElectricityBillGenerationJobView }
  | { kind: 'already_running'; job: ElectricityBillGenerationJobView }
  | { kind: 'replay'; job: ElectricityBillGenerationJobView }
> {
  const billingMonth = firstOfMonth(input.billingMonth);

  const [existingRequest] = await db
    .select()
    .from(electricityBillGenerationJobs)
    .where(eq(electricityBillGenerationJobs.requestId, input.requestId))
    .limit(1);
  if (existingRequest) {
    return { kind: 'replay', job: mapJob(existingRequest) };
  }

  const active = await getActiveElectricityBillGenerationJob({
    roomId: input.roomId,
    billingMonth,
  });
  if (active) {
    return { kind: 'already_running', job: active };
  }

  try {
    const [created] = await db
      .insert(electricityBillGenerationJobs)
      .values({
        requestId: input.requestId,
        roomId: input.roomId,
        billingMonth,
        adminId: input.adminId,
        status: 'running',
      })
      .returning();
    return { kind: 'started', job: mapJob(created) };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      const replay = await getActiveElectricityBillGenerationJob({
        roomId: input.roomId,
        billingMonth,
      });
      if (replay) return { kind: 'already_running', job: replay };
      const [byRequest] = await db
        .select()
        .from(electricityBillGenerationJobs)
        .where(eq(electricityBillGenerationJobs.requestId, input.requestId))
        .limit(1);
      if (byRequest) return { kind: 'replay', job: mapJob(byRequest) };
    }
    throw err;
  }
}

export async function completeElectricityBillGenerationJob(input: {
  jobId: string;
  status: 'success' | 'failed' | 'duplicate';
  billId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  await db
    .update(electricityBillGenerationJobs)
    .set({
      status: input.status,
      billId: input.billId ?? null,
      errorMessage: input.errorMessage ?? null,
      finishedAt: new Date(),
    })
    .where(eq(electricityBillGenerationJobs.id, input.jobId));
}

export async function waitForElectricityBillGenerationJob(
  jobId: string,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<ElectricityBillGenerationJobView | null> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollMs = options?.pollMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const job = await getElectricityBillGenerationJob(jobId);
    if (!job) return null;
    if (job.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return getElectricityBillGenerationJob(jobId);
}
