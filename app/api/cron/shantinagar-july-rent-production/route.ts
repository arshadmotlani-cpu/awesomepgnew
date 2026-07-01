import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  formatShantinagarJulyRentReport,
  runShantinagarJulyRentProduction,
} from '@/src/services/shantinagarJulyRentProduction';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'cron-shantinagar-july-rent',
  adminId: 'cron-shantinagar-july-rent',
  email: 'cron@system',
  fullName: 'Shantinagar July Rent Production',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json({ ok: false, reason: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  const pgSlug = req.nextUrl.searchParams.get('pgSlug') ?? 'shantinagar-awesome-pg';
  const lines: string[] = [];

  const report = await runShantinagarJulyRentProduction({
    session: CRON_SESSION,
    pgSlug,
    dryRun,
    onLog: (line) => lines.push(line),
  });

  const certification = formatShantinagarJulyRentReport(report);

  return Response.json({
    ok: report.complete,
    dryRun,
    complete: report.complete,
    certification,
    log: lines,
    roomsUpdated: report.roomsUpdated,
    bedsUpdated: report.bedsUpdated,
    residentsBilled: report.residentsBilled,
    residentsSkipped: report.residentsSkipped,
    duplicateInvoices: report.duplicateInvoices,
    errors: report.errors,
    missingJulyInvoice: report.missingJulyInvoice,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
