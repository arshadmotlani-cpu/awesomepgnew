import type { ReactNode } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { formatDateTime, titleCase } from '@/src/lib/format';

export function KycVerifySummarySection({
  submissionStatus,
  submittedAt,
  accountKycStatus,
  reviewedAt,
  rejectionReason,
}: {
  submissionStatus: string;
  submittedAt: Date;
  accountKycStatus?: string;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
}) {
  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Submission summary</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Compare photos to the resident profile before you approve.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Submission status"
          value={<Badge tone={toneForStatus(submissionStatus)}>{titleCase(submissionStatus)}</Badge>}
        />
        <SummaryCard label="Submitted" value={formatDateTime(submittedAt)} />
        {accountKycStatus ? (
          <SummaryCard label="Account identity" value={titleCase(accountKycStatus)} />
        ) : (
          <SummaryCard label="Account identity" value="—" />
        )}
        <SummaryCard
          label="Decision"
          value={
            reviewedAt
              ? `${titleCase(submissionStatus)} ${formatDateTime(reviewedAt)}`
              : submissionStatus === 'pending'
                ? 'Waiting for your review'
                : titleCase(submissionStatus)
          }
          compact
        />
      </dl>
      {rejectionReason ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          Rejection reason: {rejectionReason}
        </p>
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  compact,
}: {
  label: string;
  value: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={'mt-2 font-semibold text-white ' + (compact ? 'text-sm leading-snug' : 'text-sm')}>
        {value}
      </dd>
    </div>
  );
}
