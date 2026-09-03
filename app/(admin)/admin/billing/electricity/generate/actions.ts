'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { createElectricityBill } from '@/src/services/electricityBilling';
import { findExistingElectricityBillForRoomMonth } from '@/src/services/electricityInvoiceDuplicates';
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

      const existing = await findExistingElectricityBillForRoomMonth(room.roomId, billingMonth);
      if (existing) {
        results.push({
          roomId: room.roomId,
          ok: true,
          billId: existing.id,
          duplicate: true,
          message: 'Already billed',
        });
        continue;
      }

      const baseline = await resolveOfficialPreviousReading(room.roomId, billingMonth);
      if (baseline.source === 'none') {
        failed += 1;
        results.push({
          roomId: room.roomId,
          ok: false,
          message: 'Previous reading unavailable — record an opening reading first.',
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
