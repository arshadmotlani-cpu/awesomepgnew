/**
 * Room Brain — unified read snapshot composing existing Room OS engines only.
 */
import { firstOfMonth } from '@/src/services/billing';
import { todayString } from '@/src/lib/dates';
import { loadBed, loadLedger, loadRoomShared } from '@/src/roomOs/api/v1/roomOs';
import {
  buildRoomElectricitySettlementSnapshot,
  type RoomElectricitySettlementSnapshot,
} from '@/src/roomOs/engines/electricity';
import type { ExitBrainLifecycleState } from '@/src/lib/exit/exitBrainStateMachine';
import { loadRoomExitQueueForRoom } from '@/src/lib/exit/loadRoomExitQueue';
import type { BedBrainSnapshot, BookingLedgerSnapshot, RoomOsSharedSnapshot } from '@/src/roomOs/types';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { residentExitBrain } from '@/src/db/schema';
import { and } from 'drizzle-orm';

export type RoomBrainResidentRow = {
  customerId: string;
  customerName: string;
  bookingId: string | null;
  bedCode: string | null;
  residencyStatus: string;
  ledger: BookingLedgerSnapshot | null;
};

export type RoomBrainSnapshot = {
  apiVersion: 'room-brain/v1';
  roomId: string;
  billingMonth: string;
  asOf: string;
  occupancy: {
    bedCount: number;
    occupiedBedCount: number;
    residents: RoomBrainResidentRow[];
  };
  shared: RoomOsSharedSnapshot | null;
  electricitySettlement: RoomElectricitySettlementSnapshot | null;
  collection: {
    totalRequiredPaise: number;
    totalReceivedPaise: number;
    totalOutstandingPaise: number;
    settlementPercent: number;
    outstandingPercent: number;
  };
  depositRecovery: {
    totalRefundablePaise: number;
    totalHeldPaise: number;
  };
  exitMode: {
    residentsInExitMode: number;
    bookingIds: string[];
  };
  exitQueue: {
    leavingSoon: Array<{
      bookingId: string;
      customerName: string;
      expectedCheckoutDate: string;
      lifecycleState: ExitBrainLifecycleState;
      lifecycleLabel: string;
    }>;
  };
  meterStatus: string;
  billingStatus: string;
  healthStatus: 'healthy' | 'attention' | 'blocked';
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function loadRoomBrainSnapshot(input: {
  roomId: string;
  bedIds: string[];
  billingMonth?: string;
  asOf?: string;
}): Promise<RoomBrainSnapshot> {
  const billingMonth = firstOfMonth(input.billingMonth ?? todayString());
  const asOf = input.asOf ?? new Date().toISOString();

  const [sharedResult, electricitySettlement, ...bedResults] = await Promise.all([
    loadRoomShared({ roomId: input.roomId, billingMonth, asOf }),
    buildRoomElectricitySettlementSnapshot({ roomId: input.roomId, billingMonth }),
    ...input.bedIds.map((bedId) => loadBed({ bedId, asOf })),
  ]);

  const bedBrains = bedResults
    .map((r) => r.snapshot)
    .filter((s): s is BedBrainSnapshot => s != null);

  const occupiedBeds = bedBrains.filter((bed) => {
    const status = bed.bookingContext?.residencyStatus;
    return status === 'active' || status === 'vacating';
  });

  const ledgerByBooking = new Map<string, BookingLedgerSnapshot>();
  const residents: RoomBrainResidentRow[] = [];

  for (const bed of occupiedBeds) {
    const bookingId = bed.bookingContext?.bookingId ?? null;
    let ledger: BookingLedgerSnapshot | null = null;
    if (bookingId) {
      if (!ledgerByBooking.has(bookingId)) {
        const ledgerResult = await loadLedger({ bookingId, asOf });
        ledger = ledgerResult.snapshot;
        if (ledger) ledgerByBooking.set(bookingId, ledger);
      } else {
        ledger = ledgerByBooking.get(bookingId) ?? null;
      }
    }
    residents.push({
      customerId: ledger?.customerId ?? '',
      customerName: ledger?.bookingCode ?? '—',
      bookingId,
      bedCode: null,
      residencyStatus: bed.bookingContext?.residencyStatus ?? 'none',
      ledger,
    });
  }

  const ledgers = [...ledgerByBooking.values()];
  const totalRequiredPaise = ledgers.reduce((sum, l) => sum + l.totals.requiredPaise, 0);
  const totalReceivedPaise = ledgers.reduce((sum, l) => sum + l.totals.receivedPaise, 0);
  const totalOutstandingPaise = ledgers.reduce((sum, l) => sum + l.totals.outstandingPaise, 0);
  const totalRefundablePaise = ledgers.reduce((sum, l) => sum + l.deposit.refundablePaise, 0);
  const totalHeldPaise = ledgers.reduce(
    (sum, l) => sum + Math.max(0, l.deposit.receivedPaise - l.deposit.refundablePaise),
    0,
  );

  const shared = sharedResult.snapshot;
  const meterStatus = shared?.meterReadingState ?? 'missing';
  const billingStatus = shared?.nextElectricityBillStatus ?? 'awaiting_meter';

  let healthStatus: RoomBrainSnapshot['healthStatus'] = 'healthy';
  if (shared?.electricityStatus === 'blocked' || totalOutstandingPaise > totalRequiredPaise * 0.25) {
    healthStatus = 'blocked';
  } else if (
    totalOutstandingPaise > 0 ||
    shared?.electricityStatus !== 'complete' ||
    electricitySettlement?.isBalanced === false
  ) {
    healthStatus = 'attention';
  }

  const exitRows = await db
    .select({ bookingId: residentExitBrain.bookingId })
    .from(residentExitBrain)
    .where(and(eq(residentExitBrain.roomId, input.roomId), eq(residentExitBrain.status, 'active')));

  const leavingSoon = await loadRoomExitQueueForRoom(input.roomId);

  return {
    apiVersion: 'room-brain/v1',
    roomId: input.roomId,
    billingMonth,
    asOf,
    occupancy: {
      bedCount: bedBrains.length,
      occupiedBedCount: occupiedBeds.length,
      residents,
    },
    shared,
    electricitySettlement,
    collection: {
      totalRequiredPaise,
      totalReceivedPaise,
      totalOutstandingPaise,
      settlementPercent: pct(totalReceivedPaise, totalRequiredPaise),
      outstandingPercent: pct(totalOutstandingPaise, totalRequiredPaise),
    },
    depositRecovery: {
      totalRefundablePaise,
      totalHeldPaise,
    },
    exitMode: {
      residentsInExitMode: exitRows.length,
      bookingIds: exitRows.map((r) => r.bookingId),
    },
    exitQueue: {
      leavingSoon,
    },
    meterStatus,
    billingStatus,
    healthStatus,
  };
}
