'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';
import type {
  RoomElectricityAuditNavigation,
} from '@/src/services/roomElectricityAuditBundle';
import type { ElectricityPaymentHistoryRow } from '@/src/services/electricityPaymentHistory';
import { RoomElectricityAuditPanel } from '@/src/components/admin/electricity/RoomElectricityAuditPanel';
import { exportRoomElectricityAuditAction } from '@/app/(admin)/admin/electricity/bills/actions';

type Props = {
  billId: string;
  audit: RoomElectricityAuditView;
  paymentHistory: ElectricityPaymentHistoryRow[];
  navigation: RoomElectricityAuditNavigation;
  billingMonth: string;
};

function downloadBase64(filename: string, base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RoomElectricityAuditPanelClient({
  billId,
  audit,
  paymentHistory,
  navigation,
  billingMonth,
}: Props) {
  const router = useRouter();
  const [selectedBookingId, setSelectedBookingId] = useState<string>('all');
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [paidOnly, setPaidOnly] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, startExport] = useTransition();

  const filteredAudit = useMemo((): RoomElectricityAuditView => {
    let rows = audit.residentRows;
    if (selectedBookingId !== 'all') {
      rows = rows.filter((r) => r.bookingId === selectedBookingId);
    }
    if (outstandingOnly) {
      rows = rows.filter((r) => r.currentOutstandingPaise > 0);
    }
    if (paidOnly) {
      rows = rows.filter((r) => r.currentPaidPaise > 0 || r.previousCollectedPaise > 0);
    }
    return { ...audit, residentRows: rows };
  }, [audit, selectedBookingId, outstandingOnly, paidOnly]);

  const filteredPaymentHistory = useMemo(() => {
    if (selectedBookingId === 'all') return paymentHistory;
    return paymentHistory.filter((p) => p.bookingId === selectedBookingId);
  }, [paymentHistory, selectedBookingId]);

  const monthPickerValue = billingMonth.slice(0, 7);

  const handleExport = (format: 'xlsx' | 'pdf') => {
    setExportError(null);
    startExport(async () => {
      const result = await exportRoomElectricityAuditAction({ billId, format });
      if (!result.ok) {
        setExportError(result.error);
        return;
      }
      downloadBase64(
        result.filename,
        result.base64,
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      );
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.06] bg-[#12161C]/80 p-4">
        <label className="flex flex-col gap-1 text-xs text-apg-silver">
          Resident
          <select
            value={selectedBookingId}
            onChange={(e) => setSelectedBookingId(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          >
            <option value="all">All residents</option>
            {audit.residentRows.map((r) => (
              <option key={r.bookingId} value={r.bookingId}>
                {r.customerName}
              </option>
            ))}
          </select>
        </label>

        {navigation.siblingBills.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-apg-silver">
            Same month · other room
            <select
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) router.push(`/admin/electricity/bills/${id}`);
              }}
              className="rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            >
              <option value="">Room {audit.roomNumber}</option>
              {navigation.siblingBills.map((b) => (
                <option key={b.id} value={b.id}>
                  Room {b.roomNumber}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {navigation.sameRoomOtherMonths.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-apg-silver">
            Billing month
            <select
              value={monthPickerValue}
              onChange={(e) => {
                const picked = e.target.value;
                const match = navigation.sameRoomOtherMonths.find(
                  (m) => m.billingMonth.slice(0, 7) === picked,
                );
                if (match) router.push(`/admin/electricity/bills/${match.id}`);
              }}
              className="rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            >
              <option value={monthPickerValue}>{monthPickerValue}</option>
              {navigation.sameRoomOtherMonths.map((m) => (
                <option key={m.id} value={m.billingMonth.slice(0, 7)}>
                  {m.billingMonth.slice(0, 7)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex items-center gap-2 self-end pb-2 text-sm text-apg-silver">
          <input
            type="checkbox"
            checked={outstandingOnly}
            onChange={(e) => {
              setOutstandingOnly(e.target.checked);
              if (e.target.checked) setPaidOnly(false);
            }}
            className="rounded border-white/20"
          />
          Outstanding only
        </label>

        <label className="flex items-center gap-2 self-end pb-2 text-sm text-apg-silver">
          <input
            type="checkbox"
            checked={paidOnly}
            onChange={(e) => {
              setPaidOnly(e.target.checked);
              if (e.target.checked) setOutstandingOnly(false);
            }}
            className="rounded border-white/20"
          />
          Paid only
        </label>

        <div className="ml-auto flex flex-wrap gap-2 self-end">
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport('xlsx')}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
          >
            Export Excel
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport('pdf')}
            className="rounded-lg border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 px-4 py-2 text-sm font-medium text-[#FF5A1F] hover:bg-[#FF5A1F]/20 disabled:opacity-50"
          >
            Export PDF
          </button>
        </div>
      </div>

      {exportError ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">
          {exportError}
        </p>
      ) : null}

      <RoomElectricityAuditPanel
        audit={filteredAudit}
        fullAudit={audit}
        paymentHistory={filteredPaymentHistory}
      />
    </div>
  );
}
