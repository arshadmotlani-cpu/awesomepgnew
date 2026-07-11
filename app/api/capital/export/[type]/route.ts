import { NextResponse } from 'next/server';
import { requireCapitalApiAuth } from '@/src/capital/lib/api/guard';
import { hasInvestDatabaseUrl } from '@/src/capital/lib/db/env';
import {
  generateCsvReport,
  generateExcelReport,
  generatePdfReport,
} from '@/src/capital/services/reports';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const auth = await requireCapitalApiAuth();
  if ('error' in auth) return auth.error;

  const { type } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') ?? 'csv';

  if (!hasInvestDatabaseUrl()) {
    return new NextResponse('Database not configured', { status: 503 });
  }

  if (format === 'xlsx') {
    const buffer = await generateExcelReport(type);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="capital-${type}.xlsx"`,
      },
    });
  }

  if (format === 'pdf') {
    const bytes = await generatePdfReport(type);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="capital-${type}.pdf"`,
      },
    });
  }

  const csv = await generateCsvReport(type);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="capital-${type}.csv"`,
    },
  });
}
