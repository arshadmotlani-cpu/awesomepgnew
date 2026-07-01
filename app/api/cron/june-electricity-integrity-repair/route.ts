import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  formatIntegrityRepairReport,
  runJuneElectricityIntegrityRepair,
} from '@/src/services/juneElectricityIntegrityRepair';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'cron-june-electricity-integrity',
  adminId: 'cron-june-electricity-integrity',
  email: 'cron@system',
  fullName: 'June Electricity Integrity Repair',
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
  const pgQuery = req.nextUrl.searchParams.get('pg') ?? 'shanti';
  const lines: string[] = [];

  const report = await runJuneElectricityIntegrityRepair({
    session: CRON_SESSION,
    pgQuery,
    dryRun,
    onLog: (line) => lines.push(line),
  });

  const certification = formatIntegrityRepairReport(report);

  return Response.json({
    ok: report.overallPass,
    dryRun,
    overallPass: report.overallPass,
    certification,
    log: lines,
    removedInvalidInvoices: report.removedInvalidInvoices,
    removedInvalidResidents: report.removedInvalidResidents,
    regeneratedRooms: report.regeneratedRooms,
    julyRentInvoices: report.julyRentInvoices,
    rooms: report.rooms,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
