import { getAdminSession } from '@/src/lib/auth/session';
import {
  getJuneElectricityOpsGate,
  markJuneElectricityOpsCompleted,
} from '@/src/lib/admin/juneElectricityOpsGate';
import { runJuneElectricityProductionOps } from '@/src/services/juneElectricityProductionOps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const session = await getAdminSession();
  if (!session || session.role !== 'super_admin') {
    return new Response('Forbidden — Super Admin only.', { status: 403 });
  }

  const gate = await getJuneElectricityOpsGate();
  if (!gate.enabled) {
    const message = gate.completed
      ? 'Already completed — this one-time action is locked.'
      : (gate.reason ?? 'Not available');
    return new Response(message, { status: gate.completed ? 410 : 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const log = (line: string) => {
        controller.enqueue(encoder.encode(`${line}\n`));
      };

      try {
        await runJuneElectricityProductionOps({
          adminEmail: session.email,
          adminId: session.adminId,
          onLog: log,
        });
        await markJuneElectricityOpsCompleted(session.adminId);
        log('\n✓ Locked — this action cannot be run again from the admin panel.');
        controller.close();
      } catch (err) {
        log(`\n✗ FAILED: ${err instanceof Error ? err.message : String(err)}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
