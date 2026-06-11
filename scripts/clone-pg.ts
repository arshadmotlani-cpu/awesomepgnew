/**
 * Clone a PG (listing + inventory + prices + QR categories).
 *
 * Example — Central PG copy for women only:
 *   npx tsx scripts/clone-pg.ts --source=Central --name="Central PG (Female)" --gender=female
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { clonePg, findPgByNamePattern } from '../src/services/pgClone';
import type { AdminSession } from '../src/lib/auth/session';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const bootstrapSession: AdminSession = {
  kind: 'admin',
  sessionId: 'script',
  adminId: null as unknown as string,
  email: 'script@awesomepg.internal',
  fullName: 'Clone script',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function main() {
  const sourcePattern = arg('source');
  if (!sourcePattern) {
    console.error('Usage: npx tsx scripts/clone-pg.ts --source=Central [--name=...] [--gender=female]');
    process.exit(1);
  }

  const source = await findPgByNamePattern(sourcePattern);
  const gender = (arg('gender') ?? 'female') as 'male' | 'female' | 'coed';
  const defaultName =
    gender === 'female'
      ? `${source.name.replace(/\s*\(female\)\s*/i, '').trim()} (Female)`
      : `${source.name} (Copy)`;
  const name = arg('name') ?? defaultName;

  console.log(`Cloning "${source.name}" → "${name}" (${gender} only)`);

  const result = await clonePg(bootstrapSession, source.id, {
    name,
    genderPolicy: gender,
    descriptionSuffix:
      gender === 'female'
        ? `Women-only PG — same rooms and pricing as ${source.name.replace(/\s*\(female\)\s*/i, '').trim()}.`
        : undefined,
  });

  console.log('\nCreated:');
  console.log(`  id:    ${result.newPgId}`);
  console.log(`  slug:  ${result.slug}`);
  console.log(`  url:   /pgs/${result.slug}`);
  console.log(`  admin: /admin/pgs/${result.newPgId}/edit`);
  console.log(`  floors: ${result.floors}, rooms: ${result.rooms}, beds: ${result.beds}`);
  console.log(`  payment categories: ${result.paymentCategories}`);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
