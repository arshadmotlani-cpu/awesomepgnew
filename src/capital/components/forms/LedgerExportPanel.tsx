'use client';

import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';

const formats = [
  { format: 'csv', label: 'CSV' },
  { format: 'xlsx', label: 'Excel' },
  { format: 'pdf', label: 'PDF' },
];

export function LedgerExportPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Export ledger</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {formats.map((f) => (
          <Button key={f.format} variant="secondary" asChild>
            <a href={`/api/capital/export/ledger?format=${f.format}`} download>
              Download {f.label}
            </a>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
