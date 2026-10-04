'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { loadPgElectricityRoomGenerationPreview } from '@/src/lib/billing/pgElectricityGenerationPreview';
import type { PgElectricityRoomGenerationPreview } from '@/src/lib/billing/pgElectricityGenerationPreviewPure';
import { createElectricityBill } from '@/src/services/electricityBilling';
import { findExistingElectricityBillForMeterInterval } from '@/src/services/electricityInvoiceDuplicates';
import {
  ConsumptionMonthContinuityError,
} from '@/src/services/roomMeterReadingSsot';
import { resolveOfficialPreviousReading } from '@/src/services/meterTimelineService';
import { firstOfMonth } from '@/src/services/billing';

export type SelectedElectricityReading = {
  roomId: string;
  currentReadingUnits: number;
};

export type PgElectricityGenerateRoomResult = {
  roomId: string;
  ok: boolean;
  billId?: string;
  totalPaise?: number;
  message?: string;
  duplicate?: boolean;
};

export type PgElectricityGenerateResult =
  | { ok: true; results: PgElectricityGenerateRoomResult[]; generated: number; failed: number }
  | { ok: false; message: string };

export type PgElectricityPreviewResult =
  | { ok: true; preview: PgElectricityRoomGenerationPreview }
  | { ok: false; message: string };

/** Read-only meter-period allocation preview (no bill writes). */
export async function previewPgElectricityRoomGenerationAction(input: {
  roomId: string;
  billingMonth: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  ratePerUnitPaise: number;
}): Promise<PgElectricityPreviewResult> {
  try {
    await requireAdminPermission('electricity:write');
    if (!input.roomId) return { ok: false, message: 'Room is required.' };
    if (!Number.isFinite(input.previousReadingUnits) || !Number.isFinite(input.currentReadingUnits)) {
      return { ok: false, message: 'Enter valid meter readings.' };
    }
    if (input.currentReadingUnits < input.previousReadingUnits) {
      return {
        ok: false,
        message: `Current reading must be ≥ previous reading (${input.previousReadingUnits}).`,
      };
    }
    const preview = await loadPgElectricityRoomGenerationPreview({
      roomId: input.roomId,
      billingMonth: firstOfMonth(input.billingMonth),
      previousReadingUnits: input.previousReadingUnits,
      currentReadingUnits: input.currentReadingUnits,
      ratePerUnitPaise: input.ratePerUnitPaise,
    });
    return { ok: true, preview };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Preview failed.',
    };
  }
}

/**
 * Generate electricity bills for selected rooms in one PG/month.
 * Each room uses the canonical createElectricityBill engine (idempotent).
 */
export async function generateSelectedElectricityBillsAction(input: {
  pgId: string;
  billingMonth: string;
  rooms: SelectedElectricityReading[];
}): Promise<PgElectricityGenerateResult> {
  try {
    const admin = await requireAdminPermission('electricity:write');
    const billingMonth = firstOfMonth(input.billingMonth);
    if (!input.pgId) return { ok: false, message: 'Select a PG.' };
    if (!Array.isArray(input.rooms) || input.rooms.length === 0) {
      return { ok: false, message: 'Select at least one room with a current reading.' };
    }

    const results: PgElectricityGenerateRoomResult[] = [];
    let generated = 0;
    let failed = 0;

    for (const room of input.rooms) {
      if (!room.roomId || !Number.isFinite(room.currentReadingUnits)) {
        failed += 1;
        results.push({
          roomId: room.roomId || 'unknown',
          ok: false,
          message: 'Invalid room or current reading.',
        });
        continue;
      }

      let baseline;
      try {
        baseline = await resolveOfficialPreviousReading(room.roomId, billingMonth, {
          enforceContinuity: true,
        });
      } catch (err) {
        failed += 1;
        results.push({
          roomId: room.roomId,
          ok: false,
          message:
            err instanceof ConsumptionMonthContinuityError
              ? err.message
              : 'Could not resolve meter baseline.',
        });
        continue;
      }
      if (baseline.source === 'none') {
        failed += 1;
        results.push({
          roomId: room.roomId,
          ok: false,
          message: 'Previous reading unavailable — record an opening reading first.',
        });
        continue;
      }

      const existingInterval = await findExistingElectricityBillForMeterInterval(
        room.roomId,
        baseline.previousReadingUnits,
        room.currentReadingUnits,
      );
      if (existingInterval) {
        results.push({
          roomId: room.roomId,
          ok: true,
          billId: existingInterval.id,
          duplicate: true,
          message: 'Already billed for this meter interval',
        });
        continue;
      }

      if (room.currentReadingUnits < baseline.previousReadingUnits) {
        failed += 1;
        results.push({
          roomId: room.roomId,
          ok: false,
          message: `Current reading must be ≥ previous reading (${baseline.previousReadingUnits}).`,
        });
        continue;
      }

      const result = await createElectricityBill({
        roomId: room.roomId,
        billingMonth,
        previousReadingUnits: baseline.previousReadingUnits,
        currentReadingUnits: room.currentReadingUnits,
        ratePerUnitPaise: baseline.ratePerUnitPaise,
        notes: null,
        createdByAdminId: admin.adminId,
        useProRataByActiveDays: true,
      });

      if (!result.ok) {
        if (result.kind === 'already_exists') {
          results.push({
            roomId: room.roomId,
            ok: true,
            billId: result.existingBillId,
            duplicate: true,
            message: 'Already billed',
          });
          continue;
        }
        failed += 1;
        results.push({
          roomId: room.roomId,
          ok: false,
          message:
            result.kind === 'invalid_input' || result.kind === 'breakdown_failed'
              ? result.message
              : 'Failed to create bill.',
        });
        continue;
      }

      generated += 1;
      results.push({
        roomId: room.roomId,
        ok: true,
        billId: result.billId,
        totalPaise: result.totalPaise,
      });
    }

    revalidatePath('/admin/billing');
    revalidatePath('/admin/billing/electricity/generate');
    revalidatePath('/admin/electricity');

    return { ok: true, results, generated, failed };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Generation failed.',
    };
  }
}
