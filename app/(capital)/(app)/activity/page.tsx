import type { Metadata } from 'next';
import { desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Badge } from '@/src/capital/components/ui/badge';
import { capitalDb } from '@/src/capital/db/client';
import { acActivityLog } from '@/src/capital/db/schema';

export const metadata: Metadata = { title: 'Activity' };

export default async function ActivityPage() {
  const rows = await capitalDb
    .select()
    .from(acActivityLog)
    .orderBy(desc(acActivityLog.createdAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-ac-text-secondary">Audit trail of all actions</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">{row.action}</Badge>
                {row.entityType ? (
                  <span className="text-ac-text-muted">
                    {row.entityType}
                    {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
                  </span>
                ) : null}
              </div>
              <time className="text-ac-text-muted">
                {row.createdAt.toLocaleString('en-IN')}
              </time>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="py-8 text-center text-ac-text-muted">No activity yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
