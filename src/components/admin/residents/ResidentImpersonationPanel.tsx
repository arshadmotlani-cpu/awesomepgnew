'use client';

import { useState, useTransition } from 'react';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { CommandCenterSection } from '@/src/components/admin/residents/command-center/CommandCenterSection';
import { startResidentImpersonationAction } from '@/app/(admin)/admin/residents/[customerId]/impersonation-actions';
import { IMPERSONATION_DEFAULT_REASON } from '@/src/lib/auth/impersonationPolicy';
import { ACCOUNT_RESIDENT_HREF } from '@/src/lib/accountNavigation';

type AuditRow = {
  id: string;
  adminName: string;
  reason: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  exitReason: string | null;
  deviceLabel: string | null;
  ip: string | null;
};

type Props = {
  customerId: string;
  customerName: string;
  portalUrl: string;
  auditRows: AuditRow[];
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export function ResidentImpersonationPanel({
  customerId,
  customerName,
  portalUrl,
  auditRows,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState(IMPERSONATION_DEFAULT_REASON);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleCopyLink() {
    void navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startResidentImpersonationAction({ customerId, reason });
      if (result && !result.ok) {
        setError(result.error);
        setConfirmOpen(false);
      }
    });
  }

  return (
    <CommandCenterSection
      id="impersonation"
      title="Resident access"
      description="Enter the real resident portal for QA, support, and UX review. Fully audited — no credentials are changed."
    >
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Login as Resident
        </button>
        <a
          href={ACCOUNT_RESIDENT_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"
        >
          Open Resident Dashboard
        </a>
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"
        >
          {copied ? 'Copied!' : 'Copy Resident Portal Link'}
        </button>
        <button
          type="button"
          onClick={() => setShowAudit((v) => !v)}
          className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"
        >
          {showAudit ? 'Hide Audit History' : 'View Audit History'}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      {showAudit ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-apg-silver">
              <tr>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {auditRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-apg-silver">
                    No impersonation sessions recorded yet.
                  </td>
                </tr>
              ) : (
                auditRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-white">{row.adminName}</td>
                    <td className="px-3 py-2 text-apg-silver">{row.reason}</td>
                    <td className="px-3 py-2 text-apg-silver">
                      {new Date(row.startedAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-apg-silver">
                      {formatDuration(row.durationSeconds)}
                    </td>
                    <td className="px-3 py-2 capitalize text-apg-silver">{row.status}</td>
                    <td className="px-3 py-2 text-apg-silver">{row.deviceLabel ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={confirmOpen}
        title={`Login as ${customerName}?`}
        size="wide"
        confirmLabel="Continue"
        pending={pending}
        description={
          <div className="space-y-4 text-sm text-apg-silver">
            <p>
              You are about to enter this resident&apos;s account exactly as they experience the
              application. No credentials will be changed. This session is fully audited.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/70">
                Reason
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                placeholder="UX Review"
              />
            </label>
          </div>
        }
        onConfirm={handleStart}
        onCancel={() => setConfirmOpen(false)}
      />
    </CommandCenterSection>
  );
}
