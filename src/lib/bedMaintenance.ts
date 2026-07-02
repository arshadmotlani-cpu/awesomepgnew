export const BED_MAINTENANCE_REASONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'furniture', label: 'Furniture / mattress' },
  { value: 'ac_hvac', label: 'AC / HVAC' },
  { value: 'cleaning', label: 'Deep cleaning' },
  { value: 'pest_control', label: 'Pest control' },
  { value: 'painting', label: 'Painting / renovation' },
  { value: 'safety', label: 'Safety inspection' },
  { value: 'other', label: 'Other (custom)' },
] as const;

export type BedMaintenanceReason = (typeof BED_MAINTENANCE_REASONS)[number]['value'];

export type BedMaintenanceSnapshot = {
  reason: string | null;
  reasonCustom: string | null;
  startedAt: string | null;
  expectedCompletion: string | null;
  notes: string | null;
};

export function formatMaintenanceReason(
  reason: string | null | undefined,
  reasonCustom: string | null | undefined,
): string {
  if (!reason?.trim()) return 'Maintenance';
  if (reason === 'other') return reasonCustom?.trim() || 'Other';
  const match = BED_MAINTENANCE_REASONS.find((r) => r.value === reason);
  return match?.label ?? reason;
}

function formatMaintenanceDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildMaintenanceSublabel(snapshot: BedMaintenanceSnapshot): string | undefined {
  const parts: string[] = [];
  const reason = formatMaintenanceReason(snapshot.reason, snapshot.reasonCustom);
  if (reason) parts.push(reason);
  if (snapshot.startedAt) parts.push(`Since ${formatMaintenanceDate(snapshot.startedAt)}`);
  if (snapshot.expectedCompletion) {
    parts.push(`Until ${formatMaintenanceDate(snapshot.expectedCompletion)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
