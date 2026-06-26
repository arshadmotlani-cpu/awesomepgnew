import type { ResidentListRow } from '@/src/services/residentAdmin';
import { Badge } from '@/src/components/admin/Badge';

export type ResidentLifecycleLabel =
  | 'Needs KYC'
  | 'Needs Payment'
  | 'Checked In'
  | 'Living'
  | 'Vacating'
  | 'Unassigned'
  | 'Completed';

export function deriveResidentLifecycleBadge(r: ResidentListRow): {
  label: ResidentLifecycleLabel;
  tone: 'emerald' | 'amber' | 'rose' | 'zinc' | 'sky';
} {
  if (r.hasPendingKycSubmission) {
    return { label: 'Needs KYC', tone: 'amber' };
  }
  if (r.tenancyStatus === 'vacating') {
    return { label: 'Vacating', tone: 'amber' };
  }
  if (r.tenancyStatus === 'unassigned') {
    return { label: 'Unassigned', tone: 'rose' };
  }
  if (r.tenancyStatus === 'vacated' || r.tenancyStatus === 'blocked') {
    return { label: 'Completed', tone: 'zinc' };
  }
  if (r.onboardingBookingStatus === 'pending_payment' && !r.onboardingPaymentApproved) {
    return { label: 'Needs Payment', tone: 'rose' };
  }
  if (r.moveInDate && r.moveInDate > new Date().toISOString().slice(0, 10)) {
    return { label: 'Checked In', tone: 'sky' };
  }
  return { label: 'Living', tone: 'emerald' };
}

export function ResidentLifecycleBadge({ resident }: { resident: ResidentListRow }) {
  const { label, tone } = deriveResidentLifecycleBadge(resident);
  return <Badge tone={tone}>{label}</Badge>;
}
