import type { FinancialDocumentSurface } from '@/src/lib/billing/financialDocumentTheme';
import type { SettlementDisplayRow } from '@/src/lib/checkout/settlementDisplayFormat';
import type {
  SettlementStatementDocumentModel,
  SettlementStatementHeroMetric,
  SettlementStatementSection,
} from '@/src/lib/vacating/settlementStatementModel';

export type SettlementPresentationAudience = 'resident' | 'adminReview' | 'accountant';

export type SettlementPresentationView = SettlementStatementDocumentModel & {
  audience: SettlementPresentationAudience;
  heroMetrics: SettlementStatementHeroMetric[];
  rentSummary: SettlementStatementSection;
  collapsedSections: SettlementStatementSection[];
  auditTrace: SettlementStatementDocumentModel['auditTrace'];
  explanations: SettlementStatementDocumentModel['explanations'];
  /** Plain-language rows for resident optional collapsible; empty for adminReview. */
  affectsRefundSection: SettlementStatementSection | null;
  showRentSummary: boolean;
  showCollapsedSections: boolean;
  showExplanations: boolean;
  showAuditTrace: boolean;
  showUnusedRentCreditFooter: boolean;
  showSecondaryHero: boolean;
  showFullHeaderMeta: boolean;
  showHeroGrid: boolean;
  showDecisionHero: boolean;
};

export function audienceFromFinancialSurface(
  surface: FinancialDocumentSurface,
): SettlementPresentationAudience {
  if (surface === 'resident') return 'resident';
  if (surface === 'adminModal') return 'adminReview';
  return 'accountant';
}

export function resolveSettlementPresentationAudience(args: {
  surface?: FinancialDocumentSurface;
  audience?: SettlementPresentationAudience;
}): SettlementPresentationAudience {
  if (args.audience) return args.audience;
  if (args.surface) return audienceFromFinancialSurface(args.surface);
  return 'accountant';
}

export function isDecisionAudience(audience: SettlementPresentationAudience): boolean {
  return audience === 'resident' || audience === 'adminReview';
}

const PLAIN_ROW_LABEL_BY_SOURCE: Record<string, string> = {
  'Remaining notice deducted from deposit': 'Held from deposit for notice period',
  'Notice from deposit': 'Held from deposit for notice period',
  Electricity: 'Electricity (finalized after meter reading)',
  Damages: 'Room damages (finalized after inspection)',
  'Other deductions': 'Other charges',
  'Rent through vacate date': 'Rent through your move-out date',
};

function mapRowToPlainLanguage(row: SettlementDisplayRow): SettlementDisplayRow | null {
  const plainLabel = PLAIN_ROW_LABEL_BY_SOURCE[row.label];
  if (!plainLabel && !row.deduct && !row.hint?.includes('pending')) {
    return null;
  }
  return {
    ...row,
    label: plainLabel ?? row.label,
    hint: null,
  };
}

function collectPlainAffectsRefundRows(model: SettlementStatementDocumentModel): SettlementDisplayRow[] {
  const rows: SettlementDisplayRow[] = [];
  const sources = [
    ...model.collapsedSections.filter((s) =>
      ['notice_calculation', 'detailed_calculation', 'pending_deductions'].includes(s.id),
    ),
    model.rentSummary,
  ];

  for (const section of sources) {
    for (const row of section.rows) {
      const mapped = mapRowToPlainLanguage(row);
      if (mapped && (mapped.deduct || mapped.value.startsWith('−') || mapped.hint)) {
        rows.push(mapped);
      }
    }
  }

  const noticeHero = model.heroMetrics.find((m) => m.id === 'notice_deduction');
  if (noticeHero && noticeHero.tone === 'deduct') {
    rows.push({
      id: 'plain_notice_deposit',
      label: 'Held from deposit for notice period',
      value: noticeHero.value,
      deduct: true,
      hint: null,
    });
  }

  const pendingHero = model.heroMetrics.find((m) => m.id === 'pending');
  if (pendingHero && pendingHero.tone === 'pending') {
    rows.push({
      id: 'plain_pending',
      label: 'Still being finalized',
      value: pendingHero.value,
      deduct: false,
      hint: null,
    });
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.label}:${row.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function primaryRefundHero(
  metrics: SettlementStatementHeroMetric[],
): SettlementStatementHeroMetric[] {
  const primary = metrics.find((m) => m.large) ?? metrics[0];
  return primary ? [primary] : [];
}

export function applySettlementPresentationAudience(
  model: SettlementStatementDocumentModel,
  audience: SettlementPresentationAudience,
): SettlementPresentationView {
  if (audience === 'accountant') {
    return {
      ...model,
      audience,
      affectsRefundSection: null,
      showRentSummary: true,
      showCollapsedSections: true,
      showExplanations: Boolean(model.explanations?.lines.length),
      showAuditTrace: model.auditTrace.length > 0,
      showUnusedRentCreditFooter: model.estimatedUnusedRentCreditPaise > 0,
      showSecondaryHero: true,
      showFullHeaderMeta: true,
      showHeroGrid: true,
      showDecisionHero: false,
    };
  }

  const affectsRows =
    audience === 'resident' ? collectPlainAffectsRefundRows(model) : [];
  const affectsRefundSection =
    affectsRows.length > 0
      ? {
          id: 'affects_refund',
          title: 'What affects your refund',
          rows: affectsRows,
        }
      : null;

  return {
    ...model,
    audience,
    heroMetrics: primaryRefundHero(model.heroMetrics),
    rentSummary: { ...model.rentSummary, rows: [] },
    collapsedSections: [],
    auditTrace: [],
    explanations: null,
    affectsRefundSection,
    showRentSummary: false,
    showCollapsedSections: false,
    showExplanations: false,
    showAuditTrace: false,
    showUnusedRentCreditFooter: false,
    showSecondaryHero: false,
    showFullHeaderMeta: false,
    showHeroGrid: false,
    showDecisionHero: true,
  };
}

export type PlainNoticeStatus = {
  label: string;
  tone: 'compliant' | 'short';
};

export function plainNoticeStatus(args: {
  noticeCompletedDays: number;
  noticeRequiredDays: number;
}): PlainNoticeStatus {
  const short = args.noticeCompletedDays < args.noticeRequiredDays;
  if (short) {
    return {
      label: `Notice shorter than required (${args.noticeCompletedDays} of ${args.noticeRequiredDays} days)`,
      tone: 'short',
    };
  }
  return {
    label: `Notice period met (${args.noticeCompletedDays} days)`,
    tone: 'compliant',
  };
}

export function visibleSectionIds(view: SettlementPresentationView): string[] {
  const ids: string[] = [];
  if (view.showRentSummary && view.rentSummary.rows.length > 0) ids.push(view.rentSummary.id);
  if (view.showCollapsedSections) {
    ids.push(...view.collapsedSections.map((s) => s.id));
  }
  if (view.affectsRefundSection) ids.push(view.affectsRefundSection.id);
  if (view.showExplanations) ids.push('explanations');
  if (view.showAuditTrace) ids.push('audit_trace');
  return ids;
}
