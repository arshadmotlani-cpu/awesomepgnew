'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { logElectricityBillCreate } from '@/src/lib/billing/electricityBillCreateLog';
import {
  beginElectricityBillGenerationJob,
  completeElectricityBillGenerationJob,
} from '@/src/services/electricityBillGenerationJobs';
import { findExistingElectricityBillForRoomMonth } from '@/src/services/electricityInvoiceDuplicates';
import {
  createElectricityBill,
  listRoomsMissingElectricityBill,
  type RoomMissingElectricityRow,
} from '@/src/services/electricityBilling';

export type ActionState =
  | { status: 'idle' }
  | { status: 'processing'; jobId: string; requestId: string }
  | { status: 'error'; message: string; jobId?: string }
  | { status: 'duplicate'; existingBillId: string; jobId?: string }
  | { status: 'success'; billId: string; redirectTo: string; jobId: string };

function wizardRedirectUrl(
  billingMonth: string,
  pgId: string,
  currentRoomId: string,
  missing: RoomMissingElectricityRow[],
): string {
  const month = billingMonth.slice(0, 7);
  const pgRooms = missing.filter((r) => r.pgId === pgId);
  const idx = pgRooms.findIndex((r) => r.roomId === currentRoomId);
  const nextRoom = idx >= 0 ? pgRooms[idx + 1] : pgRooms[0];
  if (nextRoom) {
    return `/admin/billing/electricity/generate?month=${month}&wizard=1&pgId=${pgId}&roomId=${nextRoom.roomId}`;
  }
  const pgIds = [...new Set(missing.map((r) => r.pgId))];
  const pgIdx = pgIds.indexOf(pgId);
  const nextPgId = pgIdx >= 0 ? pgIds[pgIdx + 1] : undefined;
  if (nextPgId) {
    const first = missing.find((r) => r.pgId === nextPgId);
    if (first) {
      return `/admin/billing/electricity/generate?month=${month}&wizard=1&pgId=${nextPgId}&roomId=${first.roomId}&pgComplete=${pgId}`;
    }
  }
  return `/admin/billing/electricity/generate?month=${month}&done=1`;
}

export async function createElectricityBillAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const requestId = String(formData.get('requestId') ?? crypto.randomUUID());
  let activeJobId: string | null = null;

  try {
    const admin = await requireAdminPermission('electricity:write');

    const roomId = String(formData.get('roomId') ?? '');
    const billingMonth = String(formData.get('billingMonth') ?? '');
    const previousReadingUnits = Number(formData.get('previousReadingUnits') ?? '');
    const currentReadingUnits = Number(formData.get('currentReadingUnits') ?? '');
    const ratePerUnitInr = Number(formData.get('ratePerUnitInr') ?? '');
    const notes = String(formData.get('notes') ?? '');
    const wizardMode = formData.get('wizardMode') === '1';
    const wizardPgId = String(formData.get('wizardPgId') ?? '');

    logElectricityBillCreate('request_received', {
      requestId,
      adminId: admin.adminId,
      roomId,
      billingMonth,
      previousReadingUnits,
      currentReadingUnits,
      ratePerUnitInr,
      wizardMode,
    });

    if (!roomId) return { status: 'error', message: 'Pick a room.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billingMonth)) {
      return { status: 'error', message: 'Billing month must be YYYY-MM-01.' };
    }
    if (!Number.isFinite(previousReadingUnits) || previousReadingUnits < 0) {
      return { status: 'error', message: 'Previous reading must be ≥ 0.' };
    }
    if (!Number.isFinite(currentReadingUnits) || currentReadingUnits < 0) {
      return { status: 'error', message: 'Current reading must be ≥ 0.' };
    }
    if (currentReadingUnits < previousReadingUnits) {
      return {
        status: 'error',
        message: 'Current reading must be ≥ previous reading.',
      };
    }
    if (!Number.isFinite(ratePerUnitInr) || ratePerUnitInr < 0) {
      return { status: 'error', message: 'Rate must be ≥ 0.' };
    }

    const existingBill = await findExistingElectricityBillForRoomMonth(roomId, billingMonth);
    if (existingBill) {
      logElectricityBillCreate('response_returned', {
        requestId,
        outcome: 'duplicate_precheck',
        existingBillId: existingBill.id,
      });
      return { status: 'duplicate', existingBillId: existingBill.id };
    }

    const jobBegin = await beginElectricityBillGenerationJob({
      requestId,
      roomId,
      billingMonth,
      adminId: admin.adminId,
    });

    if (jobBegin.kind === 'replay' && jobBegin.job.status === 'running') {
      return {
        status: 'processing',
        jobId: jobBegin.job.id,
        requestId,
      };
    }

    if (jobBegin.kind === 'replay' && jobBegin.job.status !== 'running') {
      if (jobBegin.job.status === 'success' && jobBegin.job.billId) {
        return {
          status: 'success',
          billId: jobBegin.job.billId,
          redirectTo: `/admin/electricity/bills/${jobBegin.job.billId}`,
          jobId: jobBegin.job.id,
        };
      }
      if (jobBegin.job.status === 'duplicate' && jobBegin.job.billId) {
        return { status: 'duplicate', existingBillId: jobBegin.job.billId, jobId: jobBegin.job.id };
      }
      if (jobBegin.job.status === 'failed') {
        return {
          status: 'error',
          message: jobBegin.job.errorMessage ?? 'Previous generation attempt failed.',
          jobId: jobBegin.job.id,
        };
      }
    }

    if (jobBegin.kind === 'already_running') {
      return {
        status: 'processing',
        jobId: jobBegin.job.id,
        requestId,
      };
    }

    const jobId = jobBegin.job.id;
    activeJobId = jobId;

    logElectricityBillCreate('validation', { requestId, ok: true, jobId });

    const result = await createElectricityBill({
      roomId,
      billingMonth,
      previousReadingUnits,
      currentReadingUnits,
      ratePerUnitPaise: Math.round(ratePerUnitInr * 100),
      notes: notes || null,
      createdByAdminId: admin.adminId,
      useProRataByActiveDays: true,
      requestId,
    });

    if (!result.ok) {
      if (result.kind === 'already_exists') {
        await completeElectricityBillGenerationJob({
          jobId,
          status: 'duplicate',
          billId: result.existingBillId,
        });
        logElectricityBillCreate('response_returned', {
          requestId,
          outcome: 'duplicate',
          existingBillId: result.existingBillId,
          jobId,
        });
        return { status: 'duplicate', existingBillId: result.existingBillId, jobId };
      }
      const message =
        result.kind === 'invalid_input'
          ? result.message
          : result.kind === 'no_such_room'
            ? 'That room no longer exists.'
            : 'Failed to create bill.';
      await completeElectricityBillGenerationJob({
        jobId,
        status: 'failed',
        errorMessage: message,
      });
      logElectricityBillCreate('failed', { requestId, kind: result.kind, message, jobId });
      return { status: 'error', message, jobId };
    }

    await completeElectricityBillGenerationJob({
      jobId,
      status: 'success',
      billId: result.billId,
    });

    revalidatePath('/admin/electricity');
    revalidatePath('/admin/billing');
    revalidatePath('/admin/electricity/duplicates');

    const redirectTo =
      wizardMode && wizardPgId
        ? wizardRedirectUrl(
            billingMonth,
            wizardPgId,
            roomId,
            await listRoomsMissingElectricityBill(billingMonth),
          )
        : `/admin/electricity/bills/${result.billId}`;

    logElectricityBillCreate('response_returned', {
      requestId,
      outcome: 'success',
      billId: result.billId,
      redirectTo,
      invoiceCount: result.invoiceIds.length,
      jobId,
    });

    return { status: 'success', billId: result.billId, redirectTo, jobId };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Something went wrong while creating the bill.';
    if (activeJobId) {
      await completeElectricityBillGenerationJob({
        jobId: activeJobId,
        status: 'failed',
        errorMessage: message,
      }).catch(() => undefined);
    }
    logElectricityBillCreate('failed', {
      requestId,
      message,
      stack: err instanceof Error ? err.stack : undefined,
      jobId: activeJobId ?? undefined,
    });
    return {
      status: 'error',
      message: message.includes('NEXT_REDIRECT')
        ? 'Bill may have been created but navigation failed. Check electricity bills and retry if needed.'
        : message,
    };
  }
}
