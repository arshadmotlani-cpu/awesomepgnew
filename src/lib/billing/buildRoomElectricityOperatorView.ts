/**
 * Operator-facing view — resident-first cards for PG staff.
 */
import type { RoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';
import {
  buildElectricityPaymentBreakdown,
  type ElectricityPaymentBreakdownLine,
} from '@/src/lib/billing/buildElectricityPaymentBreakdown';
import {
  buildElectricityRunningBalanceTimeline,
  type ElectricityRunningBalanceEvent,
} from '@/src/lib/billing/buildElectricityRunningBalanceTimeline';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import type { ElectricityPaymentHistoryRow } from '@/src/services/electricityPaymentHistory';

export type { ElectricityPaymentBreakdownLine, ElectricityRunningBalanceEvent };

export type ElectricityLifetimeSummary = {
  totalBilledPaise: number;
  totalPaidPaise: number;
  currentOutstandingPaise: number;
  previousOutstandingCarriedForwardPaise: number;
  totalOutstandingPaise: number;
  lastPaymentDate: string | null;
  lastBillViewedDate: string | null;
  unpaidBillsCount: number;
  paymentBreakdown: ElectricityPaymentBreakdownLine[];
};

export type ElectricityInvoiceHistoryRow = {
  id: string;
  invoiceNumber: string;
  electricityBillId: string;
  billingMonth: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
  effectiveStatus: string;
  outstandingPaise: number;
  paidAt: string | null;
  dueDate: string;
  roomNumber: string;
  firstViewedAt: string | null;
  viewedSource: string | null;
  createdAt: string | null;
  financialInvoiceId: string | null;
};

export type RoomElectricityOperatorResidentRow = {
  bookingId: string;
  customerId: string;
  customerName: string;
  bedCode: string | null;
  checkIn: string;
  checkOut: string | null;
  daysCharged: number;
  unitsAllocated: number | null;
  amountAllocatedPaise: number;
  previousCollectedPaise: number;
  currentOutstandingPaise: number;
  currentPaidPaise: number;
  paymentStatus: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceCreatedAt: string | null;
  firstViewedAt: string | null;
  viewedSource: string | null;
  paidAt: string | null;
  isPaid: boolean;
  financialInvoiceId: string | null;
  invoiceHistory: ElectricityInvoiceHistoryRow[];
  paymentHistory: ElectricityPaymentHistoryRow[];
  lifetimeSummary: ElectricityLifetimeSummary;
  runningBalanceTimeline: ElectricityRunningBalanceEvent[];
};

export type RoomElectricityOperatorView = {
  roomNumber: string;
  pgName: string;
  billingMonth: string;
  unitsConsumed: number;
  ratePerUnitPaise: number;
  grossTotalPaise: number;
  residentCount: number;
  generatedAt: string | null;
  residents: RoomElectricityOperatorResidentRow[];
};

export type BuildRoomElectricityOperatorInput = {
  audit: RoomElectricityAuditView;
  invoiceHistoryByBookingId: Map<string, ElectricityInvoiceHistoryRow[]>;
  paymentHistoryByBookingId: Map<string, ElectricityPaymentHistoryRow[]>;
};

export function buildElectricityLifetimeSummary(input: {
  invoiceHistory: ElectricityInvoiceHistoryRow[];
  paymentHistory: ElectricityPaymentHistoryRow[];
  previousOutstandingCarriedForwardPaise: number;
  currentMonthOutstandingPaise: number;
}): ElectricityLifetimeSummary {
  const { invoiceHistory, paymentHistory } = input;

  const totalBilledPaise = invoiceHistory.reduce((s, inv) => s + inv.amountPaise, 0);
  const paymentBreakdown = buildElectricityPaymentBreakdown({ invoiceHistory, paymentHistory });
  const totalPaidPaise = paymentBreakdown.reduce((s, line) => s + line.amountPaise, 0);

  const totalOutstandingPaise = invoiceHistory.reduce((s, inv) => s + inv.outstandingPaise, 0);
  const unpaidBillsCount = invoiceHistory.filter(
    (inv) => inv.outstandingPaise > 0 && inv.status !== 'cancelled',
  ).length;

  const paymentDates = [
    ...invoiceHistory.map((inv) => inv.paidAt).filter(Boolean),
    ...paymentHistory.map((p) => p.date),
  ] as string[];
  const lastPaymentDate =
    paymentDates.length > 0
      ? paymentDates.sort((a, b) => b.localeCompare(a))[0]!
      : null;

  const viewedDates = invoiceHistory
    .map((inv) => inv.firstViewedAt)
    .filter(Boolean) as string[];
  const lastBillViewedDate =
    viewedDates.length > 0 ? viewedDates.sort((a, b) => b.localeCompare(a))[0]! : null;

  return {
    totalBilledPaise,
    totalPaidPaise,
    currentOutstandingPaise: input.currentMonthOutstandingPaise,
    previousOutstandingCarriedForwardPaise: input.previousOutstandingCarriedForwardPaise,
    totalOutstandingPaise,
    lastPaymentDate,
    lastBillViewedDate,
    unpaidBillsCount,
    paymentBreakdown,
  };
}

export function buildRoomElectricityOperatorView(
  input: BuildRoomElectricityOperatorInput,
): RoomElectricityOperatorView {
  const s = input.audit.roomSummary;

  const residents: RoomElectricityOperatorResidentRow[] = input.audit.residentRows.map((row) => {
    const invoiceHistory = input.invoiceHistoryByBookingId.get(row.bookingId) ?? [];
    const paymentHistory = input.paymentHistoryByBookingId.get(row.bookingId) ?? [];
    const currentInvoice =
      invoiceHistory.find((inv) => inv.id === row.invoiceId) ?? null;

    return {
      bookingId: row.bookingId,
      customerId: row.customerId,
      customerName: row.customerName,
      bedCode: row.bedCode,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      daysCharged: row.daysCharged,
      unitsAllocated: row.unitsAllocated,
      amountAllocatedPaise: row.amountAllocatedPaise,
      previousCollectedPaise: row.previousCollectedPaise,
      currentOutstandingPaise: row.currentOutstandingPaise,
      currentPaidPaise: row.currentPaidPaise,
      paymentStatus: row.paymentStatus,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      invoiceCreatedAt: currentInvoice?.createdAt ?? null,
      firstViewedAt: currentInvoice?.firstViewedAt ?? null,
      viewedSource: currentInvoice?.viewedSource ?? null,
      paidAt: currentInvoice?.paidAt ?? null,
      isPaid: row.paymentStatus === 'paid' || row.status === 'paid',
      financialInvoiceId: row.financialInvoiceId ?? null,
      invoiceHistory,
      paymentHistory,
      lifetimeSummary: buildElectricityLifetimeSummary({
        invoiceHistory,
        paymentHistory,
        previousOutstandingCarriedForwardPaise: row.previousOutstandingPaise,
        currentMonthOutstandingPaise: row.currentOutstandingPaise,
      }),
      runningBalanceTimeline: buildElectricityRunningBalanceTimeline({
        invoiceHistory,
        paymentHistory,
      }),
    };
  });

  return {
    roomNumber: s.roomNumber,
    pgName: s.pgName,
    billingMonth: input.audit.billingMonth,
    unitsConsumed: s.unitsConsumed,
    ratePerUnitPaise: s.ratePerUnitPaise,
    grossTotalPaise: s.grossTotalPaise,
    residentCount: s.residentCount,
    generatedAt: s.generatedAt,
    residents,
  };
}

export function mapElectricityInvoiceToHistoryRow(
  inv: {
    id: string;
    invoiceNumber: string;
    electricityBillId: string;
    billingMonth: string;
    dueDate: string;
    amountPaise: number;
    paidPaise: number;
    status: string;
    paidAt: Date | null;
    createdAt: Date;
    roomNumber: string;
    firstViewedAt?: Date | null;
    viewedSource?: string | null;
  },
  financialInvoiceId: string | null,
): ElectricityInvoiceHistoryRow {
  const projected = projectElectricityInvoice({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    electricityBillId: '',
    roomId: '',
    bookingId: '',
    customerId: '',
    bedId: '',
    billingMonth: inv.billingMonth,
    dueDate: inv.dueDate,
    amountPaise: inv.amountPaise,
    paidPaise: inv.paidPaise,
    lateFeeLockedPaise: null,
    status: inv.status as 'pending' | 'paid' | 'cancelled',
    paymentId: null,
    paidAt: inv.paidAt,
    paymentProofUrl: null,
    unitsShare: null,
    activeDays: null,
    cancelledAt: null,
    supersededByInvoiceId: null,
    duplicateDetectedAt: null,
    isPipelineTest: false,
    firstViewedAt: inv.firstViewedAt ?? null,
    viewedSource: inv.viewedSource ?? null,
    createdAt: inv.createdAt,
    updatedAt: inv.createdAt,
  });

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    electricityBillId: inv.electricityBillId,
    billingMonth: inv.billingMonth,
    amountPaise: inv.amountPaise,
    paidPaise: inv.paidPaise,
    status: inv.status,
    effectiveStatus: projected.effectiveStatus,
    outstandingPaise: projected.outstandingPaise,
    paidAt: inv.paidAt?.toISOString() ?? null,
    dueDate: inv.dueDate,
    roomNumber: inv.roomNumber,
    firstViewedAt: inv.firstViewedAt?.toISOString() ?? null,
    viewedSource: inv.viewedSource ?? null,
    createdAt: inv.createdAt.toISOString(),
    financialInvoiceId,
  };
}
