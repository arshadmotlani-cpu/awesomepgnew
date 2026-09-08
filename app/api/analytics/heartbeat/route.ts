import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * No-op. Older clients used this to UPDATE visitor_sessions every 30s,
 * which prevented Neon from scaling to zero. Page views still write via
 * POST /api/analytics/track. Live-visitor admin counts use last_seen_at
 * from those navigation events.
 */
export async function POST() {
  return NextResponse.json({ ok: true, skipped: true, reason: 'heartbeat_disabled' });
}
