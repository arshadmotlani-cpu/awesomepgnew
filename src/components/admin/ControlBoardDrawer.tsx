'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminBillingWhatsAppButton } from '@/src/components/admin/AdminBillingWhatsAppButton';
import { BulkBillingWhatsAppReminder } from '@/src/components/admin/BulkBillingWhatsAppReminder';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  executeOverviewActionServer,
  loadActionItemDetailOverviewAction,
  markActionResolvedOverviewAction,
  type OverviewActionState,
} from '@/app/(admin)/admin/overview/actions';
import type { ControlBoardDrillDown, ControlBoardDrillDownRow } from '@/src/lib/controlBoard/types';
import type { BillingReminderQueueItem } from '@/src/lib/billing/adminWhatsApp';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { ActionItemDetail } from '@/src/services/actionItems';

type Props = {
  drillDown: ControlBoardDrillDown;
  onClose: () => void;
  onUpdated: () => void;
};

const idle: OverviewActionState = { status: 'idle' };

export function ControlBoardDrawer({ drillDown, onClose, onUpdated }: Props) {
  const [selectedActionItemId, setSelectedActionItemId] = useState<string | null>(null);
  const [actionDetail, setActionDetail] = useState<ActionItemDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const bulkItems: BillingReminderQueueItem[] = useMemo(() => {
    if (drillDown.bulkActionKind === 'none') return [];
    return drillDown.rows
      .filter((r) => r.phone && r.billingKind && (r.status === 'pending' || r.status === 'overdue'))
      .map((r) => ({
        id: r.id,
        kind: r.billingKind as 'rent' | 'electricity',
        customerName: r.residentName,
        phone: r.phone!,
        pgName: r.pgName,
        roomNumber: r.roomNumber,
        amountPaise: r.amountPaise ?? 0,
        dueDate: r.dueDate ?? '',
        billingMonth: r.billingMonth,
        isOverdue: r.isOverdue ?? r.status === 'overdue',
      }));
  }, [drillDown]);

  useEffect(() => {
    if (!selectedActionItemId) {
      setActionDetail(null);
      return;
    }
    let cancelled = false;
    setActionLoading(true);
    void loadActionItemDetailOverviewAction(selectedActionItemId).then((d) => {
      if (cancelled) return;
      setActionDetail(d);
      setActionLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedActionItemId]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-[#0B0F14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DrawerHeader title={drillDown.title} subtitle={drillDown.subtitle} onClose={onClose} />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {selectedActionItemId && actionDetail ? (
            <ActionItemPanel
              detail={actionDetail}
              actionItemId={selectedActionItemId}
              onBack={() => setSelectedActionItemId(null)}
              onUpdated={() => {
                onUpdated();
                setSelectedActionItemId(null);
              }}
            />
          ) : selectedActionItemId && actionLoading ? (
            <p className="text-sm text-apg-silver">Loading action details…</p>
          ) : (
            <DrillDownContent
              drillDown={drillDown}
              bulkItems={bulkItems}
              onRowClick={(row) => {
                if (row.actionItemId) setSelectedActionItemId(row.actionItemId);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DrawerHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Drill down</p>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-apg-silver">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-apg-silver hover:bg-white/5 hover:text-white"
      >
        Close
      </button>
    </div>
  );
}

function DrillDownContent({
  drillDown,
  bulkItems,
  onRowClick,
}: {
  drillDown: ControlBoardDrillDown;
  bulkItems: BillingReminderQueueItem[];
  onRowClick: (row: ControlBoardDrillDownRow) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {drillDown.ledgerHref ? (
          <Link
            href={drillDown.ledgerHref}
            className="rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-2 text-sm font-medium text-white hover:border-[#FF5A1F]/40"
          >
            View full ledger →
          </Link>
        ) : null}
      </div>

      {bulkItems.length > 0 ? (
        <BulkBillingWhatsAppReminder
          kind={bulkItems[0]!.kind}
          items={bulkItems}
        />
      ) : null}

      {drillDown.rows.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
          No resident-level records for this metric yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Resident</TH>
                <TH className="hidden sm:table-cell">PG · room · bed</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {drillDown.rows.map((row) => (
                <TR
                  key={row.id}
                  className={row.actionItemId ? 'cursor-pointer hover:bg-white/[0.03]' : undefined}
                  onClick={() => onRowClick(row)}
                >
                  <TD>
                    <p className="font-medium text-white">{row.residentName}</p>
                    {row.phone ? (
                      <p className="font-mono text-[11px] text-zinc-500">{row.phone}</p>
                    ) : null}
                    {row.meta ? <p className="text-xs text-apg-silver">{row.meta}</p> : null}
                  </TD>
                  <TD className="hidden text-xs text-apg-silver sm:table-cell">
                    {[row.pgName, row.roomNumber ? `R${row.roomNumber}` : null, row.bedCode]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {row.amountPaise != null ? paiseToInr(row.amountPaise) : '—'}
                  </TD>
                  <TD>
                    {row.status ? (
                      <Badge tone={toneForStatus(row.status)}>{titleCase(row.status)}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.billingKind && row.phone && (row.status === 'pending' || row.status === 'overdue') ? (
                        <AdminBillingWhatsAppButton
                          kind={row.billingKind === 'deposit' ? 'rent' : row.billingKind}
                          customerName={row.residentName}
                          phone={row.phone}
                          pgName={row.pgName}
                          roomNumber={row.roomNumber}
                          amountPaise={row.amountPaise ?? 0}
                          dueDate={row.dueDate ?? ''}
                          billingMonth={row.billingMonth}
                          isOverdue={row.isOverdue}
                        />
                      ) : null}
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-apg-silver hover:text-white"
                        >
                          Open
                        </Link>
                      ) : null}
                      {row.actionItemId ? (
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          className="rounded-md bg-[#FF5A1F]/15 px-2 py-1 text-[11px] font-medium text-[#FF5A1F]"
                        >
                          Resolve
                        </button>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-apg-silver/70">
        {drillDown.rows.length} record{drillDown.rows.length === 1 ? '' : 's'} · click a row with
        actions to resolve
      </p>
    </div>
  );
}

function ActionItemPanel({
  detail,
  actionItemId,
  onBack,
  onUpdated,
}: {
  detail: ActionItemDetail;
  actionItemId: string;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [execState, execAction, execPending] = useActionState(executeOverviewActionServer, idle);
  const [resolveState, resolveAction, resolvePending] = useActionState(
    markActionResolvedOverviewAction,
    idle,
  );
  const [generatedQr, setGeneratedQr] = useState<string | null>(null);

  useEffect(() => {
    if (execState.status === 'ok' && execState.url) {
      window.open(execState.url, '_blank', 'noopener,noreferrer');
    }
    if (execState.status === 'ok' && execState.qrUrl) {
      setGeneratedQr(execState.qrUrl);
    }
  }, [execState]);

  useEffect(() => {
    if (resolveState.status === 'ok') onUpdated();
  }, [resolveState, onUpdated]);

  const pending = execPending || resolvePending;
  const feedback =
    execState.status !== 'idle' ? execState : resolveState.status !== 'idle' ? resolveState : null;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-apg-silver hover:text-white"
      >
        ← Back to list
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Resident" value={detail.residentName ?? '—'} />
        <Field label="PG" value={detail.pgName} />
        <Field label="Amount" value={detail.amount != null ? paiseToInr(detail.amount) : '—'} />
        <Field label="Due" value={detail.dueDate ? formatDate(detail.dueDate) : '—'} />
      </div>

      {generatedQr ? (
        <section className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-4">
          <p className="text-sm font-medium text-white">UPI QR generated</p>
          <img
            src={generatedQr}
            alt="UPI QR code"
            className="mx-auto mt-3 max-h-48 rounded-lg bg-white p-2"
          />
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
                  key={action.type}
                  href={action.href}
                  className="rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm font-medium text-white hover:border-[#FF5A1F]/40"
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
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
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
                      : action.type === 'generate_payment_link' || action.type === 'open_payment_qr'
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
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver/70">{label}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}
