import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDateTime } from '@/src/lib/format';
import type { ResidentTimelineResult } from '@/src/lib/admin/residentTimelineTypes';
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
};

function kindTone(kind: string) {
  if (kind === 'rejected' || kind === 'cancelled') return 'rose' as const;
  if (kind === 'approved' || kind === 'linked_upload') return 'emerald' as const;
  if (kind === 'submitted' || kind === 'uploaded_document' || kind === 'booking_created') {
    return 'amber' as const;
  }
  return 'zinc' as const;
}

export function CommandCenterTimeline({ timeline }: { timeline: ResidentTimelineResult }) {
  const events = [...timeline.events].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  return (
    <CommandCenterSection
      id="timeline"
      title="Timeline"
      description="Complete resident story — chronological order, every workflow event."
    >
      {events.length === 0 ? (
        <EmptyState>No timeline events yet.</EmptyState>
      ) : (
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
      )}
    </CommandCenterSection>
  );
}
