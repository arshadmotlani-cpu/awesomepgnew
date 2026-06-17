'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminActionDetailSkeleton } from '@/src/components/admin/AdminPanelSkeleton';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import {
  executeActionItemActionServer,
  loadActionItemDetailAction,
  markActionResolvedAction,
  type ActionCenterActionState,
} from '@/app/(admin)/admin/actions/actions';
import { createStaleGuard, fetchPanelData, getPanelCache } from '@/src/lib/admin/panelFetch';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { ActionItemDetail } from '@/src/services/actionItems';

type Props = {
  actionItemId: string;
  onClose: () => void;
  onUpdated: () => void;
};

const idle: ActionCenterActionState = { status: 'idle' };

export function ActionDrawer({ actionItemId, onClose, onUpdated }: Props) {
  const staleGuard = useRef(createStaleGuard());
  const [detail, setDetail] = useState<ActionItemDetail | null>(() =>
    getPanelCache<ActionItemDetail>(`action-detail:center:${actionItemId}`),
  );
  const [loading, setLoading] = useState(() => !getPanelCache<ActionItemDetail>(`action-detail:center:${actionItemId}`));
  const [error, setError] = useState<string | null>(null);
  const [execState, execAction, execPending] = useActionState(
    executeActionItemActionServer,
    idle,
  );
  const [resolveState, resolveAction, resolvePending] = useActionState(
    markActionResolvedAction,
    idle,
  );
  const [generatedQr, setGeneratedQr] = useState<string | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    const cacheKey = `action-detail:center:${id}`;
    const cached = getPanelCache<ActionItemDetail>(cacheKey);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const version = staleGuard.current.next();
    setLoading(true);
    setError(null);
    setDetail(null);

    try {
      const data = await fetchPanelData(cacheKey, () => loadActionItemDetailAction(id));
      if (staleGuard.current.isStale(version)) return;
      if (!data) {
        setError('Action item not found.');
        setDetail(null);
      } else {
        setDetail(data);
      }
    } catch {
      if (!staleGuard.current.isStale(version)) {
        setError('Could not load action details.');
      }
    } finally {
      if (!staleGuard.current.isStale(version)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDetail(actionItemId);
    return () => {
      staleGuard.current.next();
    };
  }, [actionItemId, loadDetail]);

  useEffect(() => {
    if (execState.status === 'ok' && execState.url) {
      window.open(execState.url, '_blank', 'noopener,noreferrer');
    }
    if (execState.status === 'ok' && execState.qrUrl) {
      setGeneratedQr(execState.qrUrl);
    }
  }, [execState]);

  useEffect(() => {
    if (resolveState.status === 'ok') {
      onUpdated();
      onClose();
    }
  }, [resolveState, onClose, onUpdated]);

  const pending = execPending || resolvePending;
  const feedback =
    execState.status !== 'idle'
      ? execState
      : resolveState.status !== 'idle'
        ? resolveState
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#0B0F14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Action</p>
            <h2 className="text-lg font-semibold text-white">
              {detail?.title ?? (loading ? 'Loading…' : 'Action item')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-apg-silver hover:bg-white/5 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <AdminActionDetailSkeleton />
          ) : error ? (
            <p className="text-sm text-rose-400">{error}</p>
          ) : detail ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Resident" value={detail.residentName ?? '—'} />
                <DetailField label="PG" value={detail.pgName} />
                <DetailField
                  label="Room · bed"
                  value={
                    [detail.roomNumber ? `Room ${detail.roomNumber}` : null, detail.bedCode]
                      .filter(Boolean)
                      .join(' · ') || '—'
                  }
                />
                <DetailField
                  label="Amount"
                  value={detail.amount != null ? paiseToInr(detail.amount) : '—'}
                />
                <DetailField
                  label="Due date"
                  value={detail.dueDate ? formatDate(detail.dueDate) : '—'}
                />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver/70">
                    Status
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={toneForStatus(detail.status)}>{titleCase(detail.status)}</Badge>
                    <Badge tone={detail.priority === 'high' ? 'rose' : detail.priority === 'medium' ? 'amber' : 'zinc'}>
                      {detail.priority}
                    </Badge>
                  </div>
                </div>
              </div>

              {detail.ledgerEntries.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-white">Ledger history</h3>
                  <ul className="mt-2 space-y-2">
                    {detail.ledgerEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1A1F27] px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="text-white">{entry.label}</p>
                          <p className="text-xs text-apg-silver">
                            {formatDate(entry.date)} · {titleCase(entry.kind)}
                          </p>
                        </div>
                        <span className="font-medium text-white">{paiseToInr(entry.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {generatedQr ? (
                <section className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-4">
                  <p className="text-sm font-medium text-white">UPI QR generated</p>
                  <img
                    src={generatedQr}
                    alt="UPI QR code"
                    className="mx-auto mt-3 max-h-48 rounded-lg bg-white p-2"
                  />
                  {execState.status === 'ok' && execState.whatsappUrl ? (
                    <a
                      href={execState.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-sm text-[#25D366] hover:underline"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      Share via WhatsApp
                    </a>
                  ) : null}
                </section>
              ) : null}

              {feedback ? (
                <p
                  className={
                    'rounded-lg px-3 py-2 text-sm ' +
                    (feedback.status === 'ok'
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border border-rose-500/30 bg-rose-500/10 text-rose-300')
                  }
                >
                  {feedback.message}
                </p>
              ) : null}

              <section>
                <h3 className="text-sm font-semibold text-white">Actions</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {detail.availableActions.map((action) => {
                    if (action.type === 'view_ledger' && action.href) {
                      return (
                        <Link
                          key={action.type + action.label}
                          href={action.href}
                          className="rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm font-medium text-white transition hover:border-[#FF5A1F]/40"
                        >
                          {action.label} →
                        </Link>
                      );
                    }
                    if (action.type === 'mark_resolved') {
                      return (
                        <form key={action.type} action={resolveAction}>
                          <input type="hidden" name="actionItemId" value={actionItemId} />
                          <button
                            type="submit"
                            disabled={pending}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                          >
                            {action.label}
                          </button>
                        </form>
                      );
                    }
                    return (
                      <form key={action.type + action.label} action={execAction}>
                        <input type="hidden" name="actionItemId" value={actionItemId} />
                        <input type="hidden" name="actionType" value={action.type} />
                        <button
                          type="submit"
                          disabled={pending}
                          className={
                            'w-full rounded-lg px-4 py-3 text-sm font-medium transition disabled:opacity-50 ' +
                            (action.type === 'send_whatsapp'
                              ? 'bg-[#25D366] text-white hover:bg-[#1ebe57]'
                              : action.type === 'generate_payment_link' ||
                                  action.type === 'open_payment_qr'
                                ? 'bg-[#FF5A1F] text-white hover:bg-[#e54f1a]'
                                : 'border border-white/10 bg-[#1A1F27] text-white hover:border-[#FF5A1F]/40')
                          }
                        >
                          {action.type === 'send_whatsapp' ? (
                            <span className="inline-flex items-center justify-center gap-2">
                              <WhatsAppIcon className="h-4 w-4" />
                              {action.label}
                            </span>
                          ) : (
                            action.label
                          )}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver/70">
        {label}
      </p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}
