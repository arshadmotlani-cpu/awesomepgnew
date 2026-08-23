import Link from 'next/link';
import {
  approveSubscriptionPaymentAction,
  rejectSubscriptionPaymentAction,
  saveBillingQrSettingsAction,
} from '@/src/platform/actions/manualPayments';
import { ApproveSubmissionButton } from '@/src/platform/components/admin/ApproveSubmissionButton';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import {
  getBillingQrSettings,
  listPendingSubmissions,
} from '@/src/platform/services/manualSubscriptionPayments';

function formatInrFromPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatWhen(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PlatformPaymentSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    duplicates?: string;
    error?: string;
    approved?: string;
    rejected?: string;
    saved?: string;
  }>;
}) {
  const params = await searchParams;
  const duplicatesOnly = params.duplicates === '1' || params.duplicates === 'true';
  const [submissions, qr] = await Promise.all([
    listPendingSubmissions({ duplicatesOnly }),
    getBillingQrSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Payment submissions"
        subtitle="Review manual QR subscription payments. Approving activates the organization subscription."
      />

      {params.error ? (
        <p className="mb-4 text-sm text-red-700">{params.error}</p>
      ) : null}
      {params.approved ? (
        <p className="mb-4 text-sm text-emerald-700">Submission approved and subscription activated.</p>
      ) : null}
      {params.rejected ? (
        <p className="mb-4 text-sm text-amber-800">Submission rejected.</p>
      ) : null}
      {params.saved === 'qr' ? (
        <p className="mb-4 text-sm text-emerald-700">QR settings saved.</p>
      ) : null}

      <form
        action={saveBillingQrSettingsAction}
        className="mb-8 max-w-xl rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-5"
      >
        <h2 className="mb-3 text-sm font-semibold">Billing QR settings</h2>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--plt-text-muted)]">QR image URL</span>
            <input
              name="qrImageUrl"
              defaultValue={qr?.qrImageUrl ?? ''}
              className="plt-input"
              placeholder="https://…"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--plt-text-muted)]">UPI ID</span>
            <input
              name="upiId"
              defaultValue={qr?.upiId ?? ''}
              className="plt-input"
              placeholder="merchant@upi"
            />
          </label>
          <button type="submit" className="plt-btn-secondary w-fit text-sm">
            Save QR settings
          </button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/platform/admin/payment-submissions"
          className={!duplicatesOnly ? 'font-semibold text-[var(--plt-accent)]' : 'underline'}
        >
          All pending
        </Link>
        <Link
          href="/platform/admin/payment-submissions?duplicates=1"
          className={duplicatesOnly ? 'font-semibold text-[var(--plt-accent)]' : 'underline'}
        >
          Duplicates only
        </Link>
        <span className="text-[var(--plt-text-muted)]">{submissions.length} pending</span>
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-[var(--plt-text-muted)]">No pending submissions.</p>
      ) : (
        <ul className="space-y-4">
          {submissions.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.organizationName ?? row.organizationId}</p>
                  <p className="text-xs text-[var(--plt-text-muted)]">
                    {row.planName ?? row.planId} · {formatInrFromPaise(row.amountPaise)} ·{' '}
                    {formatWhen(row.submittedAt)}
                  </p>
                  <p className="mt-1 font-mono text-sm">{row.transactionRef}</p>
                  {row.possibleDuplicate || row.duplicateBadge ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      {row.duplicateBadge ?? 'Duplicate reference ID'}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ApproveSubmissionButton
                    submissionId={row.id}
                    confirmMessage={
                      row.possibleDuplicate
                        ? row.approveConfirmMessage ??
                          'This submission is flagged as a possible duplicate. Continue?'
                        : null
                    }
                    action={approveSubscriptionPaymentAction}
                  />
                  <form action={rejectSubscriptionPaymentAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="submissionId" value={row.id} />
                    <input
                      name="reviewNote"
                      defaultValue={row.defaultRejectNote ?? 'Rejected'}
                      className="plt-input py-1 text-xs max-w-[220px]"
                    />
                    <button type="submit" className="plt-btn-secondary text-xs py-1">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
