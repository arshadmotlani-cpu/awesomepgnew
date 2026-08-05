'use client';

import type { ResidentElectricityBillingState } from '@/src/lib/residents/residentElectricityBillingState';
import { ApgCard } from '@/src/components/customer/design-system';

export function ResidentElectricityPendingCard({
  state,
}: {
  state: ResidentElectricityBillingState;
}) {
  return (
    <ApgCard tier="resident">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-apg-silver">
          Electricity
        </p>
        <p className="text-sm font-semibold text-white">Status: {state.statusLabel}</p>
        <p className="text-sm text-apg-silver">{state.message}</p>
      </div>
    </ApgCard>
  );
}
