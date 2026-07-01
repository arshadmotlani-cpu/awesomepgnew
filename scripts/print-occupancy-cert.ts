import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();
import { closeDb, db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';
import { getShantinagarOccupancyCertification } from '@/src/services/shantinagarOccupancySsotRepair';
import { ilike } from 'drizzle-orm';
import type { AdminSession } from '@/src/lib/auth/session';

const session: AdminSession = {
  kind: 'admin',
  sessionId: 'occupancy-cert-print',
  adminId: 'occupancy-cert-print',
  email: 'cert@system',
  fullName: 'Cert Print',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const [pg] = await db.select().from(pgs).where(ilike(pgs.name, '%shanti%')).limit(1);
  if (!pg) {
    console.log('PG not found');
    process.exit(1);
  }
  const cert = await getShantinagarOccupancyCertification(pg.id, session);
  console.log('occupancy pass:', cert.pass);
  console.log('orphan count:', cert.orphanResidentCount);
  console.log('room203 pass:', cert.room203?.pass ?? 'n/a');
  if (cert.room203) {
    for (const r of cert.room203.residents) {
      console.log(`  room203 ${r.name}: ₹${(r.amountPaise / 100).toFixed(0)}`);
    }
  }
  const julyIssues = cert.julyRentByResident.filter((r) => r.issue !== 'ok' && r.issue !== 'skipped_private_room');
  console.log('july rent issues:', julyIssues.length);
  for (const j of julyIssues.slice(0, 5)) console.log(' ', j.name, j.issue);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
