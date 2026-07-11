import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';

export const metadata: Metadata = { title: 'Reports' };

const reportTypes = [
  { slug: 'monthly', label: 'Monthly report', description: 'Profit and activity for the current month' },
  { slug: 'quarterly', label: 'Quarterly report', description: 'Quarter-over-quarter performance' },
  { slug: 'yearly', label: 'Yearly report', description: 'Annual portfolio summary' },
  { slug: 'lifetime', label: 'Lifetime report', description: 'All-time investment performance' },
  { slug: 'outstanding', label: 'Outstanding report', description: 'Unsettled capital by asset' },
  { slug: 'cash-flow', label: 'Cash flow', description: 'Inflows and outflows' },
  { slug: 'roi', label: 'ROI report', description: 'Return on investment analysis' },
  { slug: 'profit-loss', label: 'P&L report', description: 'Profit and loss statement' },
];

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-ac-text-secondary">Generate and export financial reports</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((r) => (
          <Link key={r.slug} href={`/reports/${r.slug}`}>
            <Card className="h-full transition-colors hover:border-ac-accent/30">
              <CardHeader>
                <CardTitle className="text-base">{r.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-ac-text-secondary">{r.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
