import type { InvoiceDocumentLetterhead } from '@/src/lib/billing/invoiceDocumentModel';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  PENDING_DAMAGES_LABEL,
  PENDING_ELECTRICITY_LABEL,
} from '@/src/lib/checkout/settlementDisplayFormat';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  type EstimatedSettlementPreview,
} from '@/src/lib/vacating/estimatedSettlementPreview';

export type SettlementStatementSummaryKpi = {
  id: string;
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'deduct' | 'pending';
};

export type SettlementStatementLineItem = {
  section: string;
  label: string;
  detail: string | null;
  amount: string;
  deduct?: boolean;
};

export type SettlementStatementDocumentModel = {
  vacatingRequestId: string;
  bookingId: string;
  statementNumber: string;
  mode: EstimatedSettlementPreview['mode'];
  modeLabel: string;
  issuedAt: string;
  disclaimer: string;
  letterhead: InvoiceDocumentLetterhead;
  customerName: string;
  customerPhone: string;
  bookingCode: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  noticeGivenDate: string;
  vacatingDate: string;
  summaryKpis: SettlementStatementSummaryKpi[];
  lineItems: SettlementStatementLineItem[];
  estimatedRefundPaise: number;
  estimatedUnusedRentCreditPaise: number;
};

function modeLabel(mode: EstimatedSettlementPreview['mode']): string {
  if (mode === 'final') return 'Final Settlement Statement';
  if (mode === 'baseline') return 'Settlement Statement (Baseline)';
  return 'Estimated Settlement Statement';
}

function modeBadge(mode: EstimatedSettlementPreview['mode']): string {
  if (mode === 'final') return 'Final';
  if (mode === 'baseline') return 'Baseline';
  return 'Estimated';
}

function pendingLabel(paise: number, pending: boolean, pendingText: string): string {
  if (pending) return pendingText;
  return paise > 0 ? `−${paiseToInr(paise)}` : paiseToInr(0);
}

export function buildSettlementStatementModel(args: {
  preview: EstimatedSettlementPreview;
  vacatingRequestId: string;
  bookingId: string;
  customerName: string;
  customerPhone: string;
  bookingCode: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  noticeGivenDate: string;
  vacatingDate: string;
  letterhead: InvoiceDocumentLetterhead;
  issuedAt?: string;
}): SettlementStatementDocumentModel {
  const w = args.preview.waterfall;
  const mode = args.preview.mode;
  const pendingElectricity =
    mode === 'estimate' || (mode === 'baseline' && w.depositBucket.electricityPaise === 0);
  const pendingDamage =
    mode === 'estimate' || (mode === 'baseline' && w.depositBucket.otherPaise === 0);

  const noticeDeductionPaise = guardDepositPaise(w.notice.fullPaise);
  const rentConsumedPaise = guardDepositPaise(w.rentBucket.consumedPaise);
  const electricityPaise = guardDepositPaise(w.depositBucket.electricityPaise);
  const damagePaise = guardDepositPaise(w.depositBucket.otherPaise);

  const summaryKpis: SettlementStatementSummaryKpi[] = [
    {
      id: 'estimated_refund',
      label: mode === 'final' ? 'Final refund' : 'Estimated refund',
      value: paiseToInr(args.preview.estimatedRefundPaise),
      tone: 'positive',
    },
    {
      id: 'deposit_held',
      label: 'Deposit held',
      value: paiseToInr(args.preview.depositHeldPaise),
    },
    {
      id: 'notice_deduction',
      label: 'Notice deduction',
      value: noticeDeductionPaise > 0 ? `−${paiseToInr(noticeDeductionPaise)}` : paiseToInr(0),
      tone: noticeDeductionPaise > 0 ? 'deduct' : 'default',
    },
    {
      id: 'rent_consumed',
      label: 'Rent consumed',
      value: paiseToInr(rentConsumedPaise),
    },
    {
      id: 'pending_charges',
      label: 'Pending electricity / damages',
      value:
        pendingElectricity && pendingDamage
          ? `${PENDING_ELECTRICITY_LABEL} · ${PENDING_DAMAGES_LABEL}`
          : pendingElectricity
            ? PENDING_ELECTRICITY_LABEL
            : pendingDamage
              ? PENDING_DAMAGES_LABEL
              : pendingLabel(electricityPaise + damagePaise, false, 'Pending'),
      tone: pendingElectricity || pendingDamage ? 'pending' : 'default',
    },
  ];

  const lineItems: SettlementStatementLineItem[] = [];
  for (const section of args.preview.sections) {
    for (const row of section.rows) {
      lineItems.push({
        section: section.title,
        label: row.label,
        detail: row.hint ?? null,
        amount: row.value,
        deduct: row.deduct,
      });
    }
  }

  const shortId = args.vacatingRequestId.slice(0, 8).toUpperCase();

  return {
    vacatingRequestId: args.vacatingRequestId,
    bookingId: args.bookingId,
    statementNumber: `EST-${shortId}`,
    mode,
    modeLabel: modeLabel(mode),
    issuedAt: args.issuedAt ?? formatDate(new Date()),
    disclaimer: args.preview.disclaimer,
    letterhead: args.letterhead,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
    bookingCode: args.bookingCode,
    pgName: args.pgName,
    roomNumber: args.roomNumber,
    bedCode: args.bedCode,
    noticeGivenDate: args.noticeGivenDate,
    vacatingDate: args.vacatingDate,
    summaryKpis,
    lineItems,
    estimatedRefundPaise: args.preview.estimatedRefundPaise,
    estimatedUnusedRentCreditPaise: args.preview.estimatedUnusedRentCreditPaise,
  };
}

export function buildSettlementStatementFromApprovalPreview(args: {
  preview: {
    residentName: string;
    pgName: string;
    roomNumber: string;
    bedCode: string;
    noticeSubmittedDate: string;
    moveOutDate: string;
    estimatedSettlement: EstimatedSettlementPreview | null;
  };
  vacatingRequestId: string;
  bookingCode?: string;
  bookingId?: string;
  customerPhone?: string;
}): SettlementStatementDocumentModel | null {
  if (!args.preview.estimatedSettlement) return null;
  return buildSettlementStatementModel({
    preview: args.preview.estimatedSettlement,
    vacatingRequestId: args.vacatingRequestId,
    bookingId: args.bookingId ?? args.vacatingRequestId,
    customerName: args.preview.residentName,
    customerPhone: args.customerPhone ?? '—',
    bookingCode: args.bookingCode ?? '—',
    pgName: args.preview.pgName,
    roomNumber: args.preview.roomNumber,
    bedCode: args.preview.bedCode,
    noticeGivenDate: args.preview.noticeSubmittedDate,
    vacatingDate: args.preview.moveOutDate,
    letterhead: buildFallbackPgLetterhead(args.preview.pgName),
  });
}

export { modeBadge as settlementStatementModeBadge };
