'use client';

import { useEffect, useState } from 'react';
import { ElectricityBillReconciliationPanel } from '@/src/components/admin/electricity/ElectricityBillReconciliationPanel';
import type { RoomCheckoutElectricityReconciliation } from '@/src/services/electricitySettlementLedger';

export function ElectricityCheckoutReconciliationPreview({
  roomId,
  billingMonth,
  grossBillPaise,
}: {
  roomId: string;
  billingMonth: string;
  grossBillPaise: number | null;
}) {
  const [data, setData] = useState<RoomCheckoutElectricityReconciliation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roomId || !billingMonth || grossBillPaise == null || grossBillPaise <= 0) {
      setData(null);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      month: billingMonth,
      grossBillPaise: String(grossBillPaise),
    });
    void fetch(`/api/admin/rooms/${roomId}/electricity-reconciliation?${params}`)
      .then((res) => res.json())
      .then((json: { ok?: boolean; data?: RoomCheckoutElectricityReconciliation }) => {
        setData(json.ok && json.data ? json.data : null);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [roomId, billingMonth, grossBillPaise]);

  if (!roomId || grossBillPaise == null || grossBillPaise <= 0) return null;
  if (loading) {
    return <p className="text-sm text-apg-silver">Loading checkout reconciliation…</p>;
  }
  if (!data || data.checkoutCollectedPaise <= 0) return null;

  return (
    <ElectricityBillReconciliationPanel
      compact
      actualBillPaise={data.grossBillPaise ?? grossBillPaise}
      checkoutCollectedPaise={data.checkoutCollectedPaise}
      remainingToRecoverPaise={data.remainingToRecoverPaise}
      entries={data.entries}
    />
  );
}
