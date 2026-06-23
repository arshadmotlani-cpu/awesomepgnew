import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDateTime } from '@/src/lib/format';
import type {
  ResidentTimelineEvent,
  ResidentTimelineResult,
} from '@/src/lib/admin/residentTimelineTypes';

const KIND_LABELS: Record<ResidentTimelineEvent['kind'], string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  status_changed: 'Status changed',
  created_settlement: 'Settlement',
  created_refund: 'Refund',
  uploaded_document: 'Upload',
  linked_upload: 'Upload linked',
  created_action_item: 'Action item',
  notification_sent: 'Notification',
  booking_created: 'Booking',
};

function kindTone(kind: ResidentTimelineEvent['kind']) {
  if (kind === 'rejected' || kind === 'cancelled') return 'rose' as const;
  if (kind === 'approved' || kind === 'linked_upload') return 'emerald' as const;
  if (kind === 'submitted' || kind === 'uploaded_document') return 'amber' as const;
  return 'zinc' as const;
}

export function ResidentTimelinePanel({ data }: { data: ResidentTimelineResult }) {
  const { subject, events, nextAction, blockedReason, existsSummary } = data;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">{subject.customerName}</h2>
            <p className="mt-1 text-sm text-apg-silver">
              {[subject.phone, subject.email].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              {subject.pgName ?? '—'} · Room {subject.roomNumber ?? '—'} · Bed{' '}
              {subject.bedCode ?? '—'}
            </p>
            {subject.bookingCode ? (
              <p className="mt-1 text-xs text-apg-silver">
                Booking{' '}
                <Link
                  href={`/admin/bookings/${subject.bookingId}`}
                  className="font-mono text-[#FF5A1F] hover:underline"
                >
                  {subject.bookingCode}
                </Link>
                {subject.bookingStatus ? ` · ${subject.bookingStatus.replace(/_/g, ' ')}` : null}
              </p>
            ) : null}
          </div>
          <Link
            href={`/admin/residents/${subject.customerId}`}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
          >
            Open resident profile
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryCard title="Does it exist?" value={existsSummary} tone="neutral" />
          <SummaryCard title="Who acts next?" value={nextAction} tone="action" />
          <SummaryCard
            title="Why blocked?"
            value={blockedReason ?? 'No blocker detected'}
            tone={blockedReason ? 'warn' : 'ok'}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
        <header className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Workflow timeline</h3>
          <p className="text-xs text-apg-silver">
            Newest first — every record with source table and ID for production debugging.
          </p>
        </header>
        {events.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-apg-silver">No events found.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Event</TH>
                <TH>Status</TH>
                <TH>Record</TH>
                <TH>Source</TH>
                <TH>Detail</TH>
              </TR>
            </THead>
            <TBody>
              {events.map((event) => (
                <TR key={event.id}>
                  <TD className="whitespace-nowrap text-xs text-apg-silver">
                    {formatDateTime(event.timestamp)}
                  </TD>
                  <TD>
                    <Badge tone={kindTone(event.kind)}>{KIND_LABELS[event.kind]}</Badge>
                    <p className="mt-1 text-sm text-white">{event.label}</p>
                  </TD>
                  <TD className="text-xs text-zinc-300">{event.status}</TD>
                  <TD className="font-mono text-[10px] text-apg-silver">
                    {event.adminHref ? (
                      <Link href={event.adminHref} className="text-[#FF5A1F] hover:underline">
                        {event.recordId.slice(0, 8)}…
                      </Link>
                    ) : (
                      event.recordId.slice(0, 8) + '…'
                    )}
                  </TD>
                  <TD className="text-xs text-apg-silver">{event.sourceTable}</TD>
                  <TD className="max-w-xs text-xs text-zinc-400">{event.detail ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: 'neutral' | 'action' | 'warn' | 'ok';
}) {
  const border =
    tone === 'action'
      ? 'border-[#FF5A1F]/30 bg-[#FF5A1F]/5'
      : tone === 'warn'
        ? 'border-amber-400/30 bg-amber-500/10'
        : tone === 'ok'
          ? 'border-emerald-400/30 bg-emerald-500/10'
          : 'border-white/10 bg-white/[0.02]';

  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{title}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}
