'use client';

import { VacatingDateChangeApprovalPanel } from '@/src/components/admin/vacating/VacatingDateChangeApprovalPanel';
import type { VacatingDateChangeBookingContext } from '@/src/components/admin/vacating/VacatingDateChangeApprovalPanel';
import type { VacatingDateChangeRequestClient } from '@/src/lib/operations/vacatingDateChangeClient';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';

export function OperationsVacatingDateChangePanels({
  pendingDateChanges,
  dateChangeContextByRequestId,
  statementDocumentByRequestId,
  focusRequestId,
  title = 'Move-out date changes',
}: {
  pendingDateChanges: VacatingDateChangeRequestClient[];
  dateChangeContextByRequestId: Record<string, VacatingDateChangeBookingContext>;
  statementDocumentByRequestId?: Record<string, SettlementStatementDocumentModel | null>;
  focusRequestId?: string | null;
  title?: string;
}) {
  if (pendingDateChanges.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-apg-silver">{title}</h3>
      {pendingDateChanges.map((request) => {
        const preview = request.previewSnapshot as VacatingDateChangePreview | null;
        const enriched = {
          ...request,
          preview: preview ?? null,
        };
        const bookingContext = dateChangeContextByRequestId[request.vacatingRequestId];
        const isFocused = focusRequestId === request.id;
        return (
          <div
            key={request.id}
            id={`date-change-${request.id}`}
            className={
              isFocused
                ? 'rounded-2xl ring-2 ring-[#FF5A1F] ring-offset-2 ring-offset-[#121820]'
                : ''
            }
          >
            <VacatingDateChangeApprovalPanel
              request={enriched}
              bookingContext={bookingContext}
              statementDocument={statementDocumentByRequestId?.[request.id] ?? null}
            />
          </div>
        );
      })}
    </div>
  );
}
