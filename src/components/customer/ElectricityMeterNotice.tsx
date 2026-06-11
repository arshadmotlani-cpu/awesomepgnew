type Variant = 'checkin' | 'banner';

export function ElectricityMeterNotice({ variant = 'banner' }: { variant?: Variant }) {
  if (variant === 'checkin') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-semibold">Meter photo required</p>
        <p className="mt-1">
          Tenant must upload a meter photo during check-in for electricity validation. Missing
          photos may result in average-based billing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
      <p className="font-semibold">Electricity billing</p>
      <p className="mt-1 text-amber-200/90">
        Electricity is billed separately from rent, based on meter readings. Missing meter photos
        will result in system-generated average billing.
      </p>
    </div>
  );
}
