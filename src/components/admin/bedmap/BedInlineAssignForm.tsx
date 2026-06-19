'use client';

import { AssignTenantForm } from '@/src/components/admin/AssignTenantForm';

export function BedInlineAssignForm({
  beds,
  bedId,
  defaultStartDate,
  prefill,
}: {
  beds: Array<{ bedId: string; label: string; monthlyRatePaise: number; depositPaise: number }>;
  bedId: string;
  defaultStartDate: string;
  prefill: {
    customerId: string;
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
  };
}) {
  return (
    <section className="rounded-xl border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 p-4">
      <h3 className="text-sm font-semibold text-white">Assign bed</h3>
      <p className="mt-1 text-xs text-apg-silver">
        Complete assignment here — no need to leave the map.
      </p>
      <div className="mt-4">
        <AssignTenantForm
          beds={beds}
          defaultBedId={bedId}
          defaultStartDate={defaultStartDate}
          prefill={prefill}
          theme="dark"
        />
      </div>
    </section>
  );
}
