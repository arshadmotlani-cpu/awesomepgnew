'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDateTime } from '@/src/lib/format';
import type { ResidentTimelineEvent, ResidentTimelineResult } from '@/src/lib/admin/residentTimelineTypes';
import { CommandCenterSection, EmptyState } from '@/src/components/admin/residents/command-center/CommandCenterSection';

const KIND_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  status_changed: 'Status',
  created_settlement: 'Settlement',
  booking_created: 'Booking',
  linked_upload: 'Upload',
  uploaded_document: 'Upload',
  notification_sent: 'Notification',
  created_action_item: 'System',
};

const TECHNICAL_KINDS = new Set([
  'notification_sent',
  'created_action_item',
  'linked_upload',
  'uploaded_document',
  'status_changed',
]);

function kindTone(kind: string) {
  if (kind === 'rejected' || kind === 'cancelled') return 'rose' as const;
  if (kind === 'approved') return 'emerald' as const;
  if (kind === 'submitted' || kind === 'booking_created' || kind === 'created_settlement') {
    return 'amber' as const;
  }
  return 'zinc' as const;
}

function TimelineTable({ events }: { events: ResidentTimelineEvent[] }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Event</TH>
            <TH>Status</TH>
            <TH className="hidden sm:table-cell">Detail</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {events.map((event) => (
            <TR key={event.id}>
              <TD className="whitespace-nowrap text-xs text-apg-silver">
                {formatDateTime(event.timestamp)}
              </TD>
              <TD>
                <Badge tone={kindTone(event.kind)}>
                  {KIND_LABELS[event.kind] ?? event.kind}
                </Badge>
                <p className="mt-1 text-sm text-white">{event.label}</p>
              </TD>
              <TD className="text-xs text-zinc-300">{event.status}</TD>
              <TD className="hidden max-w-xs text-xs text-apg-silver sm:table-cell">
                {event.detail ?? '—'}
              </TD>
              <TD className="text-right">
                {event.adminHref ? (
                  <Link
                    href={event.adminHref}
                    className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                  >
                    Open →
                  </Link>
                ) : (
                  '—'
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function CommandCenterTimeline({ timeline }: { timeline: ResidentTimelineResult }) {
  const [showTechnical, setShowTechnical] = useState(false);

  const events = useMemo(
    () => [...timeline.events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    [timeline.events],
  );

  const visibleEvents = useMemo(
    () => (showTechnical ? events : events.filter((e) => !TECHNICAL_KINDS.has(e.kind))),
    [events, showTechnical],
  );

  const hiddenTechnicalCount = events.length - events.filter((e) => !TECHNICAL_KINDS.has(e.kind)).length;

  return (
    <CommandCenterSection
      id="timeline"
      title="Timeline"
      description="Historical record — approved, completed, paid, and transferred events live here."
    >
      {events.length === 0 ? (
        <EmptyState>No timeline events yet.</EmptyState>
      ) : (
        <>
          {hiddenTechnicalCount > 0 ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-apg-silver">
                Showing {visibleEvents.length} of {events.length} events
              </p>
              <button
                type="button"
                onClick={() => setShowTechnical((v) => !v)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white"
              >
                {showTechnical ? 'Hide technical events' : 'Show technical events'}
              </button>
            </div>
          ) : null}
          {visibleEvents.length === 0 ? (
            <EmptyState>No business events yet — enable technical events to see system activity.</EmptyState>
          ) : (
            <TimelineTable events={visibleEvents} />
          )}
        </>
      )}
    </CommandCenterSection>
  );
}
