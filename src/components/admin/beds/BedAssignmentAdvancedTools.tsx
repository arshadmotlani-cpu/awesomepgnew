import Link from 'next/link';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';

export function BedAssignmentAdvancedTools() {
  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Legacy bed workflows — move bed, force remove, vacating, maintenance."
      defaultOpen={false}
    >
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/bookings/new"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          Assign tenant (full form) →
        </Link>
        <Link
          href="/admin/residents"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          All residents →
        </Link>
        <Link
          href="/admin/pgs"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          PG settings & rooms →
        </Link>
        <Link
          href="/admin/vacating"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          Move-out pipeline →
        </Link>
        <Link
          href="/admin/system/bed-audit"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          Bed audit →
        </Link>
      </div>
      <p className="text-xs text-apg-silver">
        Move bed, force remove tenant, vacating controls, and maintenance are in Advanced tools on
        each bed in the map — select a bed, then open Advanced tools in the side panel.
      </p>
    </AdminAdvancedToolsSection>
  );
}
