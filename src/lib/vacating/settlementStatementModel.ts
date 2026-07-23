import type { InvoiceDocumentLetterhead } from '@/src/lib/billing/invoiceDocumentModel';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  PENDING_DAMAGES_LABEL,
  PENDING_ELECTRICITY_LABEL,
  type SettlementDisplayRow,
} from '@/src/lib/checkout/settlementDisplayFormat';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { type EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';

export type SettlementStatementHeroMetric = {
  id: string;
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'deduct' | 'pending';
  large?: boolean;
};

export type SettlementStatementSection = {
  id: string;
  title: string;
  rows: SettlementDisplayRow[];
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
  heroMetrics: SettlementStatementHeroMetric[];
  rentSummary: SettlementStatementSection;
  collapsedSections: SettlementStatementSection[];
  auditTrace: Array<{ id: string; label: string; value: string }>;
  estimatedRefundPaise: number;
  estimatedUnusedRentCreditPaise: number;
  refundTotalLabel: string;
};

function modeLabel(mode: EstimatedSettlementPreview['mode']): string {
  if (mode === 'final') return 'Final Settlement Statement';
  if (mode === 'baseline') return 'Settlement Statement (Baseline)';
  return 'Estimated Settlement Statement';
}

export function modeBadge(mode: EstimatedSettlementPreview['mode']): string {
  if (mode === 'final') return 'Final';
  if (mode === 'baseline') return 'Baseline';
  return 'Estimated';
}

export { modeBadge as settlementStatementModeBadge };

function findSection(preview: EstimatedSettlementPreview, title: string) {
  return preview.sections.find((s) => s.title === title);
}

function mapRowsWithHints(rows: SettlementDisplayRow[]): SettlementDisplayRow[] {
  return rows.map((row) => ({ ...row }));
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
  const electricityPaise = guardDepositPaise(w.depositBucket.electricityPaise);
  const damagePaise = guardDepositPaise(w.depositBucket.otherPaise);

  const pendingElectricityLabel = pendingElectricity
    ? PENDING_ELECTRICITY_LABEL
    : electricityPaise > 0
      ? `−${paiseToInr(electricityPaise)}`
      : paiseToInr(0);
  const pendingDamageLabel = pendingDamage
    ? PENDING_DAMAGES_LABEL
    : damagePaise > 0
      ? `−${paiseToInr(damagePaise)}`
      : paiseToInr(0);

  const heroMetrics: SettlementStatementHeroMetric[] = [
    {
      id: 'estimated_refund',
      label: mode === 'final' ? 'Final refund' : 'Estimated refund',
      value: paiseToInr(args.preview.estimatedRefundPaise),
      tone: 'positive',
      large: true,
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
      id: 'pending',
      label: 'Pending',
      value: `${pendingElectricityLabel} · ${pendingDamageLabel}`,
      tone: pendingElectricity || pendingDamage ? 'pending' : 'default',
    },
  ];

  const rentSection = findSection(args.preview, 'Rent');
  const rentSummary: SettlementStatementSection = {
    id: 'rent_summary',
    title: 'Rent summary',
    rows: rentSection ? mapRowsWithHints(rentSection.rows) : [],
  };

  const billing = findSection(args.preview, 'Billing & dates');
  const notice = findSection(args.preview, 'Notice');
  const deposit = findSection(args.preview, 'Deposit');
  const pending =
    findSection(args.preview, 'Pending deductions') ?? findSection(args.preview, 'Deductions');

  const collapsedSections: SettlementStatementSection[] = [
    billing ? { id: 'billing_dates', title: 'Billing & dates', rows: mapRowsWithHints(billing.rows) } : null,
    notice ? { id: 'notice_calculation', title: 'Notice calculation', rows: mapRowsWithHints(notice.rows) } : null,
    deposit ? { id: 'detailed_calculation', title: 'Detailed calculation', rows: mapRowsWithHints(deposit.rows) } : null,
    pending
      ? {
          id: 'pending_deductions',
          title: pending.title === 'Deductions' ? 'Deductions' : 'Pending deductions',
          rows: mapRowsWithHints(pending.rows),
        }
      : null,
  ].filter((s): s is SettlementStatementSection => s != null);

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
    heroMetrics,
    rentSummary,
    collapsedSections,
    auditTrace: args.preview.auditTrace ?? [],
    estimatedRefundPaise: args.preview.estimatedRefundPaise,
    estimatedUnusedRentCreditPaise: args.preview.estimatedUnusedRentCreditPaise,
    refundTotalLabel: mode === 'final' ? 'Final refund' : 'Estimated refund',
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
