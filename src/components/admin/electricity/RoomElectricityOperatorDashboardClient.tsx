'use client';

import { useRouter } from 'next/navigation';
import type { RoomElectricityOperatorView } from '@/src/lib/billing/buildRoomElectricityOperatorView';
import type { RoomElectricityAuditNavigation } from '@/src/services/roomElectricityAuditBundle';
import { RoomElectricityOperatorDashboard } from '@/src/components/admin/electricity/RoomElectricityOperatorDashboard';

type Props = {
  operator: RoomElectricityOperatorView;
  navigation: RoomElectricityAuditNavigation;
  billingMonth: string;
};

export function RoomElectricityOperatorDashboardClient({
  operator,
  navigation,
  billingMonth,
}: Props) {
  const router = useRouter();
  const monthPickerValue = billingMonth.slice(0, 7);

  return (
    <div className="space-y-4">
      {(navigation.siblingBills.length > 0 || navigation.sameRoomOtherMonths.length > 0) && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.06] bg-[#12161C]/80 p-4">
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
                <option value="">Room {operator.roomNumber}</option>
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
        </div>
      )}

      <RoomElectricityOperatorDashboard operator={operator} />
    </div>
  );
}
