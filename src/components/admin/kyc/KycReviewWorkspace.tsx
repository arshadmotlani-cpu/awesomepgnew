'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useState } from 'react';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import {
  approveKycAction,
  rejectKycAction,
  skipToNextKycAction,
  type KycReviewActionState,
} from '@/app/(admin)/admin/residents/kyc/actions';
import { KYC_DOCUMENT_LABELS, kycDocumentUrl } from '@/src/lib/kyc/documentUrls';
import { formatDateTime } from '@/src/lib/format';
import type { KycReviewContext } from '@/src/services/kyc';

const INITIAL: KycReviewActionState = { status: 'idle' };

const PRIMARY =
  'w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50';

type Props = {
  ctx: KycReviewContext;
  pendingIds: string[];
};

export function KycReviewWorkspace({ ctx, pendingIds }: Props) {
  const { submission, customer, booking, queuePosition, queueTotal } = ctx;
  const submissionId = submission.id;
  const isPending = submission.status === 'pending';
  const router = useRouter();

  const approveFormId = useId().replace(/:/g, '');
  const rejectFormId = useId().replace(/:/g, '');
  const skipFormId = useId().replace(/:/g, '');

  const [approveState, approveAction, approvePending] = useActionState(approveKycAction, INITIAL);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectKycAction, INITIAL);
  const [skipState, skipAction, skipPending] = useActionState(skipToNextKycAction, INITIAL);
  const [showCorrection, setShowCorrection] = useState(false);

  const busy = approvePending || rejectPending || skipPending;

  useEffect(() => {
    for (const state of [approveState, rejectState, skipState]) {
      if (state.status === 'ok') {
        if (state.nextSubmissionId) {
          router.push(`/admin/residents/kyc/${state.nextSubmissionId}`);
        } else {
          router.push('/admin/residents/kyc');
        }
        router.refresh();
        break;
      }
    }
  }, [approveState, rejectState, skipState, router]);

  const feedback =
    approveState.status === 'error'
      ? approveState
      : rejectState.status === 'error'
        ? rejectState
        : skipState.status === 'error'
          ? skipState
          : null;

  const validationIssues = summarizeValidationIssues(submission.validationReport);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
            KYC review workspace
            {isPending && queueTotal > 0
              ? ` · ${queuePosition} of ${queueTotal} pending`
              : null}
          </p>
          <h1 className="text-xl font-bold text-white">{customer.fullName}</h1>
        </div>
        {pendingIds.length > 1 ? (
          <nav className="flex flex-wrap gap-1">
            {pendingIds.map((id, i) => (
              <Link
                key={id}
                href={`/admin/residents/kyc/${id}`}
                className={
                  'rounded px-2 py-1 text-xs font-medium ' +
                  (id === submissionId
                    ? 'bg-[#FF5A1F] text-white'
                    : 'text-apg-silver hover:bg-white/5 hover:text-white')
                }
              >
                {i + 1}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(220px,260px)_1fr_minmax(280px,320px)]">
        {/* Left — resident + application */}
        <aside className="space-y-4 rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-sm">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Why review
            </h2>
            <p className="mt-2 text-white">
              {isPending
                ? 'Resident submitted identity documents and is waiting for approval before check-in.'
                : `Submission already ${submission.status}.`}
            </p>
            {validationIssues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200">
                {validationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Resident
            </h2>
            <dl className="mt-2 space-y-1 text-apg-silver">
              <div>
                <dt className="text-[10px] uppercase">Phone</dt>
                <dd className="font-mono text-white">{customer.phone}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase">Email</dt>
                <dd className="text-white">{customer.email}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase">Account KYC</dt>
                <dd className="text-white">{customer.kycStatus}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase">Submitted</dt>
                <dd>{formatDateTime(submission.createdAt)}</dd>
              </div>
            </dl>
          </section>

          {booking ? (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
                Application
              </h2>
              <dl className="mt-2 space-y-1 text-apg-silver">
                <div>
                  <dt className="text-[10px] uppercase">Booking</dt>
                  <dd>
                    <Link
                      href={`/admin/bookings/${booking.id}`}
                      className="font-mono text-[#FF5A1F] hover:underline"
                    >
                      {booking.bookingCode}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase">PG · room · bed</dt>
                  <dd className="text-white">
                    {booking.pgName} · R{booking.roomNumber} · {booking.bedCode}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase">Booking status</dt>
                  <dd>{booking.status}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <Link
            href={`/admin/residents/${customer.id}`}
            className="block text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            Open resident profile →
          </Link>
        </aside>

        {/* Center — documents */}
        <main className="space-y-4">
          <KycDocPanel
            title={KYC_DOCUMENT_LABELS.aadhaar_front}
            src={kycDocumentUrl(submissionId, 'aadhaar_front')}
            large
          />
          <KycDocPanel
            title={KYC_DOCUMENT_LABELS.aadhaar_back}
            src={kycDocumentUrl(submissionId, 'aadhaar_back')}
            large
          />
        </main>

        {/* Right — selfie comparison + actions */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Face comparison
            </h2>
            <p className="mt-1 text-xs text-apg-silver">
              Compare selfie to Aadhaar photo — do they match?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <KycDocPanel
                title="Aadhaar photo"
                src={kycDocumentUrl(submissionId, 'aadhaar_front')}
                compact
              />
              <KycDocPanel
                title={KYC_DOCUMENT_LABELS.selfie}
                src={kycDocumentUrl(submissionId, 'selfie')}
                compact
              />
            </div>
          </section>

          {isPending ? (
            <section className="flex flex-1 flex-col rounded-xl border border-white/10 bg-[#1A1F27] p-4">
              <h2 className="text-sm font-semibold text-white">Decision</h2>
              <p className="mt-1 text-xs text-apg-silver">
                After you decide, the next pending review opens automatically.
              </p>

              <form id={approveFormId} action={approveAction} className="mt-4">
                <input type="hidden" name="submissionId" value={submissionId} />
                <AdminConfirmSubmit
                  formId={approveFormId}
                  title="Approve identity?"
                  description="Resident can check in. Queue advances to the next submission."
                  confirmLabel="Approve"
                  pending={approvePending}
                  disabled={busy && !approvePending}
                  className={PRIMARY}
                >
                  {approvePending ? 'Approving…' : 'Approve'}
                </AdminConfirmSubmit>
              </form>
              <p className="mt-2 text-[11px] text-emerald-300/90">
                Then → resident cleared for check-in · next KYC opens
              </p>

              {!showCorrection ? (
                <button
                  type="button"
                  onClick={() => setShowCorrection(true)}
                  className="mt-4 w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"
                >
                  Request correction
                </button>
              ) : (
                <form id={rejectFormId} action={rejectAction} className="mt-4 space-y-2 border-t border-white/10 pt-4">
                  <input type="hidden" name="submissionId" value={submissionId} />
                  <label className="block text-xs font-medium text-apg-silver">
                    What must they fix?
                    <textarea
                      name="reason"
                      rows={3}
                      required
                      autoFocus
                      placeholder="e.g. Aadhaar number not visible"
                      className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <AdminConfirmSubmit
                    formId={rejectFormId}
                    title="Request correction?"
                    description="Resident must re-upload. Queue advances to the next submission."
                    confirmLabel="Send correction request"
                    tone="danger"
                    pending={rejectPending}
                    disabled={busy && !rejectPending}
                    className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {rejectPending ? 'Sending…' : 'Request correction'}
                  </AdminConfirmSubmit>
                  <p className="text-[11px] text-apg-silver">
                    Then → resident notified to re-upload · next KYC opens
                  </p>
                </form>
              )}

              {queueTotal > 1 ? (
                <form id={skipFormId} action={skipAction} className="mt-auto pt-4">
                  <input type="hidden" name="submissionId" value={submissionId} />
                  <button
                    type="submit"
                    disabled={busy}
                    className="text-xs text-apg-silver hover:text-white disabled:opacity-50"
                  >
                    Skip to next in queue →
                  </button>
                </form>
              ) : null}

              {feedback ? (
                <p className="mt-3 text-sm text-rose-300">{feedback.message}</p>
              ) : null}
            </section>
          ) : (
            <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-sm text-apg-silver">
              <p className="font-semibold text-white">Already reviewed</p>
              {submission.rejectionReason ? (
                <p className="mt-2">Reason: {submission.rejectionReason}</p>
              ) : null}
              {submission.reviewedAt ? (
                <p className="mt-1">Reviewed {formatDateTime(submission.reviewedAt)}</p>
              ) : null}
              <Link
                href="/admin/residents/kyc"
                className="mt-4 inline-block text-sm font-semibold text-[#FF5A1F] hover:underline"
              >
                Back to queue →
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function KycDocPanel({
  title,
  src,
  large,
  compact,
}: {
  title: string;
  src: string;
  large?: boolean;
  compact?: boolean;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <figcaption className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white">
        {title}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        className={
          (compact ? 'aspect-square ' : 'min-h-[280px] ') +
          'w-full object-contain bg-black/30'
        }
      />
    </figure>
  );
}

function summarizeValidationIssues(report: unknown): string[] {
  if (!report || typeof report !== 'object') return [];
  const issues: string[] = [];
  for (const [key, value] of Object.entries(report as Record<string, unknown>)) {
    if (value && typeof value === 'object' && 'ok' in value && value.ok === false && 'reason' in value) {
      issues.push(`${key}: ${String(value.reason)}`);
    }
  }
  return issues;
}
