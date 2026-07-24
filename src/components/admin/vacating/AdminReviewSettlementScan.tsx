'use client';

import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { settlementStatementPageHref } from '@/src/lib/billing/settlementStatementPdfLinks';
import { plainNoticeStatus } from '@/src/lib/vacating/settlementPresentationAudience';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';

export function AdminReviewSettlementScan({
  statement,
  vacatingRequestId,
  noticeCompletedDays,
  noticeRequiredDays,
  moveOutDate,
  estimatedDeductionPaise,
  noticeLine,
  linkClassName = 'font-medium text-[#FF5A1F] hover:underline',
  tone = 'light',
}: {
  statement: SettlementStatementDocumentModel;
  vacatingRequestId: string;
  noticeCompletedDays?: number;
  noticeRequiredDays?: number;
  moveOutDate: string;
  estimatedDeductionPaise?: number;
  /** When set, overrides notice day comparison. */
  noticeLine?: string;
  linkClassName?: string;
  tone?: 'light' | 'amber';
}) {
  const notice =
    noticeLine != null
      ? { label: noticeLine, tone: 'compliant' as const }
      : plainNoticeStatus({
          noticeCompletedDays: noticeCompletedDays ?? 0,
          noticeRequiredDays: noticeRequiredDays ?? 30,
        });
  const scanBorder =
    tone === 'amber' ? 'border-emerald-400/40 bg-emerald-950/30' : 'border-emerald-200 bg-emerald-50';
  const scanTitle = tone === 'amber' ? 'text-emerald-100/80' : 'text-emerald-900/70';
  const scanAmount = tone === 'amber' ? 'text-emerald-50' : 'text-emerald-900';
  const scanDate = tone === 'amber' ? 'text-emerald-100' : 'text-emerald-950';

  return (
    <div className="space-y-3">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${scanBorder}`}>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${scanTitle}`}>
            Scan before approve
          </p>
          <p className={`text-lg font-bold tabular-nums ${scanAmount}`}>
            {paiseToInr(statement.estimatedRefundPaise)}
          </p>
        </div>
        <p className={`text-sm ${scanDate}`}>
          Leaving <span className="font-semibold">{formatDate(moveOutDate)}</span>
        </p>
      </div>

      <ul className={`space-y-1 text-sm ${tone === 'amber' ? 'text-amber-100/90' : 'text-zinc-700'}`}>
        <li
          className={
            notice.tone === 'short'
              ? tone === 'amber'
                ? 'text-amber-200'
                : 'text-amber-900'
              : undefined
          }
        >
          {notice.label}
        </li>
        {estimatedDeductionPaise && estimatedDeductionPaise > 0 ? (
          <li>Notice from deposit: {paiseToInr(estimatedDeductionPaise)}</li>
        ) : null}
      </ul>

      <p className={`text-xs ${tone === 'amber' ? 'text-amber-200/70' : 'text-zinc-500'}`}>
        <Link href={settlementStatementPageHref(vacatingRequestId)} target="_blank" className={linkClassName}>
          Open full statement
        </Link>
        {' · '}
        Accounting detail, audit trail, and PDF on the statement page.
      </p>
    </div>
  );
}
