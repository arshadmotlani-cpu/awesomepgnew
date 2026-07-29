import { ReportsPlaceholder } from '@/src/hair/components/reports/ReportsPlaceholder';

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Reports</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold capitalize">finance gst</h1>
      </div>
      <ReportsPlaceholder title="Coming soon" />
    </div>
  );
}
